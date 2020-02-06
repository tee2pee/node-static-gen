module.exports = (() => {
  return {
    dist: '{{{ dist }}}',
    
    ignore: [
      'config.js',
      'dist',
    ],
    
    handle: [
      {
        include: [ '.pages' ],
        exclude: [],
        handler: 'generate',
      },
      {
        include: [ '**.js' ],
        exclude: [ '**.min.js' ],
        handler: [ 'js-minify' ],
        charset: 'utf-8',
      },
      {
        include: [ '**.css'],
        exclude: [ '**.min.css' ],
        handler: [ 'css-minify' ],
        charset: 'utf-8',
      },
      {
        include: [ '**.scss' ],
        exclude: [],
        handler: [ 'scss-compile', 'css-minify' ],
        charset: 'utf-8',
        replace: path => path.replace(/\.scss$/, '.css'),
      },
    ]
  };
})();