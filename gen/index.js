const fs = require('fs');
const fsPromises = fs.promises;
const pt = require('path');
const xlsx = require('xlsx');
const mustache = require('mustache');
const generate = require('./lib/generate.js');
const handler = require('./lib/handler.js');
const server = require('./lib/server.js');
const common = require('./lib/common.js');
const AppError = require('./lib/app-error.js');

// ルートディレクトリ
const ROOT_DIR = pt.join(__dirname, '..');

// ローカルサーバーポート
const LOCAL_PORT = 3000;

// WEBサーバーURL
const WEBSVR_URL = 'http://localhost:8080/';

const UPD = 1;
const DEL = 2;
const run = async (fr, to, conf, dev) => {
  try {
    // パス正規化
    let frPath = pt.resolve(fr);
    let toPath = pt.resolve(to);
    let frPathStat = await common.stat(frPath);
    if (!frPathStat || !frPathStat.isDirectory()) {
      throw new AppError(`ディレクトリが見つかりません: ${frPath}`);
    }
    
    // configコンパイル
    let config = Object.assign({}, conf);
    config.ignore = config.ignore.map(g => common.glob2regexp(g));
    for (let e of config.handle) {
      if (e.include) { e.include = e.include.map(g => common.glob2regexp(g)); }
      if (e.exclude) { e.exclude = e.exclude.map(g => common.glob2regexp(g)); }
    }

    // ディレクトリ初期化
    const dirinit = async (path, root = true) => {
      let stats = await common.stat(path);
      if (stats) {
        let task = null;
        switch (true) {
          case stats.isSymbolicLink():
          case stats.isFile():
            task = fsPromises.unlink(path);
            break;
          case stats.isDirectory():
            let items = await fsPromises.readdir(path, { withFileTypes: true });
            await Promise.all(items.map((e) => dirinit(pt.join(path, e.name), false)));
            if (root) return;
            task = fsPromises.rmdir(path);
            break;
          default:
            return;
        }
        await task.catch(e => {
          if (['EBUSY', 'ENOTEMPTY'].indexOf(e.code || '') < 0) {
            throw e;
          }
        });
      }
    };
    dirinit(toPath, true);
    
    // 変更検知
    let devinfo = {
      devIsReady: false,
      livereload: null,
    };
    let listener = (() => {
      let buf = {}, tmr = null;
      const main = async () => {
        // リスト化
        let list = Object.keys(buf).map(e => ({ event: buf[e], abspath: e }));
        
        // 初期化
        buf = {};
        tmr = null;
        
        // ソート
        // DEL(長->短)->UPD(短->長)
        list.sort((a, b) => {
          if (a.event > b.event) return -1;
          if (a.event < b.event) return  1;
          if (a.abspath.length > b.abspath.length) return a.event == UPD ?  1 : -1;
          if (a.abspath.length < b.abspath.length) return a.event == UPD ? -1 :  1;
          return 0;
        });

        // 処理開始
        let isGenerated = false;
        for (let e of list) {
          let { event, abspath } = e;
          try {
            let relpath = pt.relative(frPath, abspath);
            
            // 除外判定
            if (common.isMatch(config.ignore, relpath)) {
              continue;
            }
            
            // 処理判定
            let hitem = config.handle.find(e =>
               common.isMatch(e.include, relpath) &&
              !common.isMatch(e.exclude, relpath)
            );
            
            // 除外判定（handler）
            if (hitem && hitem.handler === 'ignore') {
              continue;
            }
            
            // パス
            let fr = pt.join(frPath, relpath);
            let to = pt.join(toPath, relpath);
            let frStat = await common.stat(fr);
            
            // パス変更
            if (hitem && hitem.replace) {
              to = hitem.replace(to);
            }
            
            // 処理
            if (event === UPD) {
              if (hitem && hitem.handler) {
                if (hitem.handler === 'generate') {
                  // 自動生成
                  if (!isGenerated) {
                    await generate(
                      pt.join(frPath, '.pages', 'pages.xlsx'),
                      pt.join(toPath, 'public'),
                      pt.join(frPath, '.pages', 'template'),
                      conf
                    );
                    isGenerated = true;
                  }
                } else if (hitem.handler === 'copy') {
                  // コピー
                  await common.copy(fr, to);
                } else if (Array.isArray(hitem.handler) && !frStat.isDirectory()) {
                  // 変換
                  let charset = hitem.charset || 'utf-8';
                  let content = await fsPromises.readFile(fr, { encoding: charset });
                  for (let e of hitem.handler) {
                    content = await handler[e](content, fr, to, hitem);
                  }
                  await common.fmkdir(pt.dirname(to));
                  await fsPromises.writeFile(to, content, { encoding: charset });
                } else {
                  // デフォルト処理（コピー）
                  await common.copy(fr, to);
                }
              } else {
                // デフォルト処理（コピー）
                await common.copy(fr, to);
              }
            } else {
              // 削除
              await common.remove(to, { recursive: true });
            }
          } catch (e) {
            if (e instanceof AppError) {
              console.log('WARN:', e.message);
            } else {
              throw e;
            }
          }
        }
        if (devinfo.devIsReady) {
          devinfo.livereload(); // ブラウザリロード
        }
      };
      return (event, abspath) => {
        buf[abspath] = event;
        if (tmr == null) {
          setTimeout(main, 500);
        }
      };
    })();
    
    // 自動生成
    let frTree = await common.getRelativeTree(frPath);
    if (frTree.length > 0) {
      frTree.sort((a, b) => {
        if (a.length > b.length) return  1;
        if (a.length < b.length) return -1;
        return 0;
      });
      for (let e of frTree) {
        listener(UPD, pt.join(frPath, e));
      }
    } else {
      // 初期ファイルがないので
      isReady = true;
    }
    
    // 開発時
    if (dev) {
      // サーバー起動
      let svr = server(LOCAL_PORT, WEBSVR_URL);
      
      // 監視開始
      fs.watch(frPath, { recursive : true }, async (evt, rel) => {
        let abspath = pt.join(frPath, rel);
        let s = await common.stat(abspath);
        if (!devinfo.devIsReady) {
          devinfo.devIsReady = true;
          devinfo.livereload = svr.livereload;
        }
        listener(s ? UPD : DEL, abspath);
      });
    }
  } catch (e) {
    if (e instanceof AppError) {
      console.log('ERROR:', e.message);
    } else {
      throw e;
    }
  }
};

const createNewProject = async (projectPath, fr, to) => {
  let stat = common.statSync(fr);
  if (stat) {
    switch (true) {
      case stat.isSymbolicLink():
      case stat.isFile():
        let basename = pt.basename(fr);
        if (basename == 'pages.xlsx') {
          let wb = xlsx.utils.book_new();
          let ws = xlsx.utils.aoa_to_sheet([
            ['template',       'path',             'title',        'description',             'js', 'css', 'content'            ],
            ['REQ',            'REQ',              'REQ',          'REQ',                     '',   '',    ''                   ],
            ['/example.html',  '/index.html',      'Hello World!', 'description /index',      '',   '',    'content /index'     ],
            ['/example.html',  '/page/about.html', 'About',        'description /page/about', '',   '',    'content /page/about'],
            ['/example.html',  '/page/help.html',  'Help',         'description /page/help',  '',   '',    'content /page/help' ],
          ]);
          xlsx.utils.book_append_sheet(wb, ws, 'pages');
          xlsx.writeFile(wb, to);
        } else {
          let content = fs.readFileSync(fr, { encoding: 'utf-8' });
          if (basename == 'config.js') {
            content = mustache.render(content, {
              dist: JSON.stringify(pt.join(projectPath, 'dist')).slice(1, -1)
            });
          }
          fs.writeFileSync(to, content);
        }
        console.log('create', to)
        break;
      case stat.isDirectory():
        fs.mkdirSync(to);
        console.log('create', to)
        let items = fs.readdirSync(fr, { withFileTypes: true });
        for (let e of items) {
          createNewProject(projectPath, pt.join(fr, e.name), pt.join(to, e.name));
        }
        break;
      default:
        return;
    }
  }
};

const getConfig = (dir) => {
  return require(pt.join(dir, 'config.js'));
};
const command = {
  new: (path) => {
    if (common.statSync(path)) {
      throw new AppError(`ディレクトリが既に存在します: ${path}`);
    }
    let base = pt.join(__dirname, 'base');
    createNewProject(path, base, path);
    console.log('finish.');
  },
  dev: (path) => {
    run(path, pt.join(ROOT_DIR, 'docker', 'web', 'docroot'), getConfig(path), true);
  },
  build: (path) => {
    let conf = getConfig(path);
    run(path, conf.dist, conf, false);
  }
};
try {
  if (process.argv.length < 4) {
    throw new AppError('引数が不正です');
  }
  let oper = process.argv[2];
  if (!(oper in command)) {
    throw new AppError('引数が不正です');
  }
  let path = pt.resolve(pt.join(ROOT_DIR, 'app', process.argv[3]));
  command[oper](path);
} catch (e) {
  if (e instanceof AppError) {
    console.log('ERROR:', e.message);
  } else {
    throw e;
  }
}