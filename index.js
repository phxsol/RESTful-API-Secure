/*  A Less-Simple, Secured API
 *    This web server provides a RESTful api which may be called.
 *
 *  Index.js | Primary file for the app
 *  Notes:
 *    Self-Starting Module
 *      Upon being called, this module spins up the underlying servers.
 *
 *    API Probing
 *      Invalid paths should expect a statusCode of 418 "I'm a teapot.",
 *      to indicate that this server can't do what it isn't built for.
 *
 */
 
 let server = require('./lib/server');
 let workers = require('./lib/workers');

let app = {};
app.init = ()=>{
  // Start the server
  server.init();
  // Start the workers
  workers.init();
}

// Execute initialization prior to exportation
app.init();
module.exports = app;
