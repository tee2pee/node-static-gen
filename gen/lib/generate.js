const fs = require('fs');
const fsPromises = fs.promises;
const pt = require('path');
const xlsx = require('xlsx');
const mustache = require('mustache');
const common = require('./common.js');
const AppError = require('./app-error.js');

const KEY_TMPL = 'template';
const KEY_PATH = 'path';

const loadPages = (() => {
  const MAX_SIZE = 1024;
  
  // セルの値取得
  const getCell = function(sheet, row, col) {
    return sheet[xlsx.utils.encode_cell({ r: row, c: col })];
  };
  
  // ヘッダレコード読込
  const getHeadRecord = function(sheet, row) {
    let record = [];
    for (let col = 0; col < MAX_SIZE; col++) {
      let cell = getCell(sheet, row, col);
      if (cell && cell.w) {
        record.push(cell.w);
      } else {
        break;
      }
    }
    return record;
  };
  
  // レコード読込
  const getRecord = function(sheet, keys, row) {
    let record = {};
    for (let col = 0; col < keys.length; col++) {
      let cell = getCell(sheet, row, col), val = '';
      if (cell && cell.w) {
        val = cell.w;
      }
      record[keys[col]] = val;
    }
    return record;
  };
  
  // 処理
  return (xlsxPath) => {
    let wb = xlsx.readFile(xlsxPath), allPages = [];
    for (let sheetName of wb.SheetNames) {
      let ws = wb.Sheets[sheetName];
      
      // ヘッダ行の取得
      let keys = getHeadRecord(ws, 0);
      if (keys.indexOf(KEY_TMPL) < 0) {
        throw new AppError(`エクセルファイルに[${KEY_TMPL}]の列が見つかりません: ${xlsxPath}`);
      }
      if (keys.indexOf(KEY_PATH) < 0) {
        throw new AppError(`エクセルファイルに[${KEY_PATH}]の列が見つかりません: ${xlsxPath}`);
      }
      
      // オプション行の取得
      let opts = getRecord(ws, keys, 1);
      for (let key in opts) {
        opts[key] = opts[key].length <= 0 ? [] : opts[key].split(/\s+/g);
      }
      
      // ページ行の取得
      let pages = [];
      for (let row = 2; row < MAX_SIZE; row++) {
        let page = getRecord(ws, keys, row);
        if (Object.values(page).some(e => e.length > 0)) {
          pages.push(page);
        } else {
          break;
        }
      }
      
      // バリデーション / 変換
      for (let page of pages) {
        for (let key of keys) {
          let val = page[key]; // TODO: 変数書き換え
          let cnv = null;
          for (let opt of opts[key]) {
            switch (opt.toUpperCase()) {
              case 'UNQ': // 一意
                for (let i = 0; i < pages.length; i++) {
                  if (pages[i] != page && pages[i][key] == val) {
                    throw new AppError(`エクセルファイルに重複した値があります: ${val}`);
                  }
                }
                break;
              case 'REQ': // 必須
                if (val.length <= 0) {
                  throw new AppError(`エクセルファイルに入力のないセルがあります`);
                }
                break;
              case 'CSV': // CSV
                cnv = v => v.length > 0 ? v.split(/,/g) : [];
                break;
              case 'NSV': // 改行区切り
                cnv = v => v.length > 0 ? v.split(/\r\n|\r|\n/g) : [];
                break;
              case 'FLG': // フラグ
                cnv = v => v.length > 0;
                break;
              default: break;
            }
          }
          page[key] = cnv ? cnv(val) : val;
        }
      }
      
      // 追加
      allPages.push(...pages);
    };
    return allPages;
  };
})();


// templatePath
module.exports = async (xlsxPath, genrDir, tmplDir, config) => {
  // ページ読み込み
  let pages = loadPages(xlsxPath);
  
  // ページ出力
  let manager = [];
  for (let page of pages) {
    let tmplPath = pt.resolve(tmplDir + page[KEY_TMPL]);
    let tmplStat = await common.stat(tmplPath);
    if (!tmplStat) {
      throw new AppError(`テンプレートファイルが存在しません: ${page[KEY_TMPL]}`);
    }
    let content = await fsPromises.readFile(tmplPath, { encoding: 'utf-8' }); // TODO: charset
    manager.push({
      path: pt.join(genrDir + page[KEY_PATH]),
      body: mustache.render(content, {
        site: {
          pages: pages
        },
        page: page,
        config: config
      })
    });
  }
  for (let e of manager) {
    await common.fmkdir(pt.dirname(e.path));
    await fsPromises.writeFile(e.path, e.body);
  }
};