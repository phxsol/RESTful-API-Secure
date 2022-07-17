/*
* server.js | Contains the server functionality
*/

let http = require('http');
let https = require('https');
const url = require('url');
const StringDecoder = require('string_decoder').StringDecoder;
let config = require('./config');
let fs = require('fs');
let handlers = require('./handlers');
let helpers = require('./helpers');
let path = require('path');
let workers = require('./workers');
let util = require('util');
let debug = util.debuglog('server');

// Instantiate the HTTPS server
httpsServerOptions = {
 'key': fs.readFileSync(path.join(__dirname,'./../https/key.pem')),
 'cert': fs.readFileSync(path.join(__dirname, './../https/cert.pem'))
}

// Initialization for server
let server = {};
server.init = ()=>{
  // Instantiate the HTTP server
  server.openServer = http.createServer((req,res)=>{
   server.singleServer(req,res);
  });
  // Start the HTTP server
  server.openServer.listen(config.httpPort, ()=>{
    workers.log('INFO',{'src': `SYS-${Date.now()}`, 'msg': `[HTTP] I've got my ears on... listening to port ${config.httpPort} as a ${config.envName} server`});
    console.log(`\x1b[32m[HTTP]\x1b[0m I've got my ears on... listening to port \x1b[32m${config.httpPort}\x1b[0m as a \x1b[32m${config.envName}\x1b[0m server`);
  });


  server.secureServer = https.createServer(httpsServerOptions,(req,res)=>{
   server.singleServer(req,res);
  });
  // Start the HTTPS server
  server.secureServer.listen(config.httpsPort, ()=>{
   workers.log('INFO',{'src': `SYS-${Date.now()}`, 'msg': `[HTTPS] I've got my ears on... listening to port ${config.httpsPort} as a ${config.envName} server.`});
   console.log(`\x1b[33m[HTTPS]\x1b[0m I've got my ears on... listening to port \x1b[33m${config.httpsPort}\x1b[0m as a \x1b[33m${config.envName}\x1b[0m server`);
  });


  // All your requests are belong to us.
  server.singleServer = (req,res)=>{

   // Get the URL and parse it.
   let parsedUrl = url.parse(req.url,true);

   // Get the path
   let path = parsedUrl.pathname;
   let trimmedPath = path.replace(/^\/+|\/+$/g,'');

   // Get the query string as an object
   let queryStringObj = parsedUrl.query;

   // Identify the HTTP Method
   let method = req.method.toUpperCase();

   // Suss out the Headers
   let headers = req.headers;

   // Get the payload
   let decoder = new StringDecoder('utf-8');
   let pool = '';
   req.on('data',(stream)=>{pool+=decoder.write(stream);});

   req.on('end',()=>{
     // Cap off the pool
     pool += decoder.end();

     // Log the request path
     // workers.log('INFO',{'src': reqID, 'msg':`Request received: ${reqID}`});

     // Choose the handler to respond to this Request
     let chosenHandler = (typeof(server.router[trimmedPath]) !== 'undefined') ? server.router[trimmedPath] : handlers.notFound;

     // Package the meta data calculated so far, to be sent along to the handler
     let reqPkg = {
       'trimmedPath': trimmedPath,
       'queryStringObj': queryStringObj,
       'method': method,
       'headers': headers,
       'payload': helpers.parseJSONtoObject(pool),
       'src': {
         'reqID': (typeof(headers.reqID) !== 'undefined') ? headers.reqID : helpers.generateToken(4),
         'user': headers.phone || false
       }
     }
     reqPkg.src.forLogging = `${reqPkg.src.user || 'ANON'}-${reqPkg.src.reqID}`;
     debug(`\x1b[32mREQ:\x1b[0m\n%s`,reqPkg);
     chosenHandler(reqPkg,server.SendResponse);
   });

   server.SendResponse = (statusCode, resPkg) => {
     // Inherit the statusCode from the handler's response, or set a default of 200 (okie dokie).
     statusCode = (typeof(statusCode) == 'number') ? statusCode : 200;

     // Normalize the resPkg parameter
     resPkg = (typeof(resPkg) == 'object') ? resPkg : {};


     // stringify the resPkg into a silly string
     responseString = JSON.stringify(resPkg);

     // formally respond to the Request
     res.setHeader('Content-Type','application/json');
     res.writeHead(statusCode);
     res.end(responseString);
   }
  }


  server.router = {
   'a' : handlers.aRoute,
   'ping': handlers.ping,
   'users': handlers.users,
   'tokens': handlers.tokens,
   'orders': handlers.orders
  }
}

module.exports = server;
