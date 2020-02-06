const UglifyJS = require('uglify-js');
const CleanCSS = require('clean-css');
const NodeSass = require('node-sass');
const TypeScript = require('typescript');

module.exports = {
  'scss-compile': async (content, from, to) => {
    return NodeSass.renderSync({
      file: from,
      data: content,
      outFile: to,
      outputStyle: 'nested'
    }).css.toString();
  },
  'css-minify': async (content) => {
    return new CleanCSS({}).minify(content).styles;
  },
  'ts-compile': async (content) => {
    return TypeScript.transpileModule(content, {}).outputText;
  },
  'js-minify': async (content) => {
    return UglifyJS.minify(content, {}).code;
  }
};
