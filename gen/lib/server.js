const pt = require('path');
const zlib = require('zlib');
const express = require('express');
module.exports = (port, target) => {
  let ctx = {};
  
  // サーバー変数
  let app = express();
  let svr = require('http').Server(app);
  let sio = require('socket.io')(svr);
  
  // ライブリロード
  let emitName = 'livereload';
  let sioPath = '/socket-io';
  let sioBody = ''
    + `<script src="${sioPath}/socket.io.slim.js"></script>`
    + `<script>io().on("${emitName}",function(){location.reload();});</script>`;
  app.use(sioPath, express.static(pt.join(pt.dirname(require.resolve('socket.io-client')), '..', 'dist')));
  
  // プロキシ
  let proxy = new require('http-proxy').createProxyServer({ target: target });
  proxy.on('proxyRes', (proxyRes, req, res) => {
    if ((proxyRes.headers['content-type'] || '').indexOf('text/html') >= 0) {
      let _w = res.write, _e = res.end;
      let buf = null;
      res.write = (data) => {
        buf = buf === null ? data : Buffer.concat([buf, data]);
      };
      res.end = () => {
        let extr = null;
        switch ((proxyRes.headers['content-encoding'] || '')) {
          case 'gzip':
            extr = zlib.gunzip;
            break;
          case 'deflate':
            extr = zlib.inflate;
            break;
        }
        (extr || ((data, callback) => {
          callback(null, data);
        }))(buf, (err, data) => {
          if (!err) {
            let rep = '</body>';
            let idx = data.indexOf(rep);
            if (idx >= 0) {
              buf = Buffer.concat([
                data.slice(0, idx),
                Buffer.from(`${sioBody}${rep}`),
                data.slice(idx + rep.length)
              ]);
              if (extr) {
                res.removeHeader('content-encoding');
              }
              if (res.hasHeader('content-length')) {
                res.setHeader('content-length', buf.length);
              }
            }
          }
          _w.call(res, buf);
          _e.call(res);
        });
      };
    }
  });
  proxy.on('error', function(e) {
    // console.log('proxy error');
  });
  app.use((req, res, next) => {
    proxy.proxyRequest(req, res);
  });
  
  // サーバー起動
  svr.listen(port);
  
  // 更新関数
  ctx.livereload = () => {
    sio.emit(emitName);
  };
  
  return ctx;
};