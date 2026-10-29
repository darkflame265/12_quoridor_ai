// Both spectator engines are loaded lazily inside module Workers.
const nativeProxy={'/api/native':{target:'http://127.0.0.1:4317',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/native/,'')},'/api/experimental':{target:'http://127.0.0.1:4318',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/experimental/,'')},'/api/pressure':{target:'http://127.0.0.1:4319',changeOrigin:true,rewrite:path=>path.replace(/^\/api\/pressure/,'')}};
export default {worker:{format:'es'},server:{proxy:nativeProxy},preview:{proxy:nativeProxy}};
