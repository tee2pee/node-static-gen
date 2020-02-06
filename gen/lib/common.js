const fs = require('fs');
const fsPromises = fs.promises;
const pt = require('path');

// Glob -> RegExp
const glob2regexp = (() => {
  let escapePttrn = /[\\^$.*+?()[\]{}|]/g;
  let escapeRegex = (str) => {
    return str.replace(escapePttrn, m => '\\' + m);
  };
  let sep = escapeRegex(pt.sep);
  return pattern => new RegExp(
    '^' + pattern.split('/').map(e1 =>
      e1
      .split('*')
      .map(e2 => escapeRegex(e2))
      .join('*')
      .replace(/\*+/g, m =>
        m.length > 1
        ? '.*?'
        : '[^' + sep + ']*?'
      )
    ).join(sep) + '(' + sep + '.+)?$'
  );
})();
exports.glob2regexp = glob2regexp;

// ファイル一覧取得
const getRelativeTree = (() => {
  let getItemsCore = async (dir, rel = '') => {
    let result = [], items = await fsPromises.readdir(dir, { withFileTypes: true });
    for (var i = 0; i < items.length; i++) {
      let each = items[i];
      let abspath = pt.join(dir, each.name);
      let relpath = pt.join(rel, each.name);
      result.push(relpath);
      if (each.isDirectory()) {
        result.push(...(await getItemsCore(abspath, relpath)));
      }
    }
    return result;
  };
  return async (dir) => {
    return await getItemsCore(pt.resolve(dir));
  };
})();
exports.getRelativeTree = getRelativeTree;

// 状態取得
const stat = (path) => {
  return fsPromises.stat(path).catch(e => false);
};
exports.stat = stat;

// 状態取得(Sync)
const statSync = (path) => {
  try {
    return fs.statSync(path);
  } catch (e) {
    return false;
  }
};
exports.statSync = statSync;

// コピー
const fcopyFile = async (fr, to) => {
  await fmkdir(pt.dirname(to));
  await fsPromises.copyFile(fr, to);
};
exports.fcopyFile = fcopyFile;

// フォルダ作成
const fmkdir = async (path) => {
  let _stat = await stat(path);
  if (!_stat) {
    await fmkdir(pt.dirname(path));
    await fsPromises.mkdir(path);
  }
};
exports.fmkdir = fmkdir;

// コピー
const copy = async (fr, to, options = {}) => {
  let {
    recursive = false,
  } = options;
  let stats = await stat(fr);
  if (stats) {
    switch (true) {
      case stats.isSymbolicLink():
      case stats.isFile():
        await fcopyFile(fr, to);
        break;
      case stats.isDirectory():
        await fmkdir(to);
        if (recursive) {
          let items = await fsPromises.readdir(fr, { withFileTypes: true });
          await Promise.all(items.map((e) => copy(pt.join(fr, e.name), pt.join(to, e.name), options)));
        }
        break;
      default:
        return;
    }
  }
};
exports.copy = copy;

// 削除
const remove = async (path, options = {}) => {
  let {
    recursive = false,
  } = options;
  let stats = await stat(path);
  if (stats) {
    switch (true) {
      case stats.isSymbolicLink():
      case stats.isFile():
        await fsPromises.unlink(path);
        break;
      case stats.isDirectory():
        if (recursive) {
          let items = await fsPromises.readdir(path, { withFileTypes: true });
          await Promise.all(items.map((e) => remove(pt.join(path, e.name), options)));
        }
        await fsPromises.rmdir(path);
        break;
      default:
        return;
    }
  }
};
exports.remove = remove;

// マッチ
const isMatch = (regexes, value) => {
  if (regexes) {
    for (let e of regexes) {
      if (value.match(e)) {
        return true;
      }
    }
  }
  return false;
};
exports.isMatch = isMatch;
