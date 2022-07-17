/*
*   Request Handlers
*
*/

let _data = require('./data');
let helpers = require('./helpers');
let config = require('./config');
let workers = require('./workers');
let util = require('util');
let debug = util.debuglog('handlers');

let handlers = {};


// ./a
handlers.aRoute = (reqPkg, callback) =>{
  workers.log('USER',{'src': reqPkg.src.forLogging, 'msg': 'a route accessed', 'payload': {'reqPkg': reqPkg}});
  callback(200);
}

// ./orders
handlers.orders = (reqPkg, callback)=>{
  const acceptableMethods = ['POST','GET','PUT','DELETE'];
  if(acceptableMethods.indexOf(reqPkg.method) > -1){
    handlers._orders[reqPkg.method](reqPkg,callback);
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg': 'Invalid request passed to [./orders] handler', 'payload': {'reqPkg': reqPkg}});
    callback(418);
  }
}

// Container for the orders subroutines
handlers._orders = {};

// ./orders [POST]
// Required: protocol, url, method, successCodes, timeoutSeconds
// Optional: N/A
handlers._orders.POST = (reqPkg, callback)=>{
  // Validate the submitted fields
  let protocol = (typeof(reqPkg.payload.protocol) == 'string' && ['https','http'].indexOf(reqPkg.payload.protocol) > -1) ? reqPkg.payload.protocol.trim() : false;
  let url = (typeof(reqPkg.payload.url) == 'string' && reqPkg.payload.url.trim().length > 0) ? reqPkg.payload.url.trim() : false;
  let method = (typeof(reqPkg.payload.method) == 'string' && ['POST','GET','PUT','DELETE'].indexOf(reqPkg.payload.method) > -1) ? reqPkg.payload.method.trim() : false;
  let successCodes = (typeof(reqPkg.payload.successCodes) == 'object' && reqPkg.payload.successCodes instanceof Array && reqPkg.payload.successCodes.length > 0) ? reqPkg.payload.successCodes : false;
  let timeoutSeconds = (typeof(reqPkg.payload.timeoutSeconds) == 'number' && reqPkg.payload.timeoutSeconds % 1 === 0 && reqPkg.payload.timeoutSeconds >= 1 && reqPkg.payload.timeoutSeconds <= 5) ? reqPkg.payload.timeoutSeconds : false;
  // Get the token & email from the Headers
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;


  // Verify that the required fields have been passed
  if(protocol && url && method && successCodes && timeoutSeconds && token && email){
    // Verify that the token is valid for this request
    handlers._tokens.verifyToken(token, email, (tokenIsValid)=>{
      // Lookup the user by reading the token
      _data.read('tokens',email, (err, tokenData)=>{
        if(!err && tokenData){
          // Lookup the user data
          _data.read('users',email,(err,userData)=>{
            if(!err && userData){
              let userorders = (typeof(userData.orders) == 'object' && userData.orders instanceof Array) ? userData.orders : [];
              // Verify that the user has less than the number of max-orders-per-user
              if(userorders.length < config.maxorders){
                // Create a random id for the check
                let orderID = helpers.generateToken(20);

                // Create the check object, and include the user's email
                let checkObject = {
                  'id': orderID,
                  'userEmail': email,
                  'protocol': protocol,
                  'url': url,
                  'method': method,
                  'successCodes': successCodes,
                  'timeoutSeconds': timeoutSeconds
                };

                _data.create('orders',orderID,checkObject,(err)=>{
                  if(!err){
                    // Add the orderID to the user data object
                    userData.orders = userorders;
                    userData.orders.push(orderID);

                    // Save the updated user data
                    _data.update('users',email,userData, (err)=>{
                      if(!err){
                        // Return the data about the new check
                        workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`New check added`,'payload': {'reqPkg': reqPkg}});
                        callback(200, checkObject);
                      } else {
                        workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Error': 'Failed to update the user with a new check`,'payload': {'reqPkg': reqPkg}});
                        callback(500, {'Error': 'Failed to update the user with a new check'});
                      }
                    });
                  } else {
                    workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Error': 'Failed to create new check`,'payload': {'reqPkg': reqPkg}});
                    callback(500, {'Error': 'Failed to create new check'});
                  }
                });
              } else {
                workers.log('ERR',{'src': reqPkg.src.forLogging, 'msg':`Error': 'Failed to create new check`,'payload': {'reqPkg': reqPkg}});
                callback(409, {'Error': 'Too many orders assigned already ('+config.maxorders+'), remove one before adding another'});
              }
            } else {
              workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Unauthorized to access this token`,'payload': {'reqPkg': reqPkg}});
              callback(418, {'Warning':'Unauthorized to access this token'});
            }
          });
        } else {
          workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Unauthorized to access this data set`,'payload': {'reqPkg': reqPkg}});
          callback(418, {'Warning': 'Unauthorized to access this data set'});
        }
      });
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Input is missing or invalid`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Warning': 'Input is missing or invalid'});
  }
}


// ./orders [GET]
// Required: id
// Optional: N/A
handlers._orders.GET = (reqPkg, callback)=>{
  // Check that the id is valid
  let orderID = (typeof(reqPkg.payload.id) == 'string') ? reqPkg.payload.id : false;
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;
  if(orderID && email && token){
    handlers._tokens.verifyToken(token, email, (tokenIsValid)=>{
      if(tokenIsValid){
        // Lookup the orders for this user
        _data.read('orders',orderID,(err, ordersData)=>{
          if(!err && ordersData){
            workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Fetched check data`,'payload': {'reqPkg': reqPkg}});
            callback(200, ordersData)
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`No orders data exists for that record`,'payload': {'reqPkg': reqPkg}});
            callback(418, {'Warning': 'No orders data exists for that record'});
          }
        });
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Provided token is invalid`,'payload': {'reqPkg': reqPkg}});
        callback(418,{'Warning':'Provided token is invalid'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error':'Missing required field'});
  }
}

// ./orders [PUT]
// Required: id
// Optional: protocol, url, method, successCodes, timeoutSeconds (One must be sent)
handlers._orders.PUT = (reqPkg, callback)=>{
  // Check for the required field
  let orderID = (typeof(reqPkg.payload.id) == 'string') ? reqPkg.payload.id : false;

  // Check for the field data to modify
  let protocol = (typeof(reqPkg.payload.protocol) == 'string' && ['https','http'].indexOf(reqPkg.payload.protocol) > -1) ? reqPkg.payload.protocol.trim() : false;
  let url = (typeof(reqPkg.payload.url) == 'string' && reqPkg.payload.url.trim().length > 0) ? reqPkg.payload.url.trim() : false;
  let method = (typeof(reqPkg.payload.method) == 'string' && ['POST','GET','PUT','DELETE'].indexOf(reqPkg.payload.method) > -1) ? reqPkg.payload.method.trim() : false;
  let successCodes = (typeof(reqPkg.payload.successCodes) == 'object' && reqPkg.payload.successCodes instanceof Array && reqPkg.payload.successCodes.length > 0) ? reqPkg.payload.successCodes : false;
  let timeoutSeconds = (typeof(reqPkg.payload.timeoutSeconds) == 'number' && reqPkg.payload.timeoutSeconds % 1 === 0 && reqPkg.payload.timeoutSeconds >= 1 && reqPkg.payload.timeoutSeconds <= 5) ? reqPkg.payload.timeoutSeconds : false;
  // Get the email and token from the headers
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;
  // Verify that the required field and an additional field is passed
  if(protocol || url || method || successCodes || timeoutSeconds && orderID && email && token){
    handlers._tokens.verifyToken(token, email, orderID, (tokenIsValid)=>{
      if(tokenIsValid){
        // Lookup the check
        _data.read('orders',orderID,(err, orderData)=>{
          if(!err && orderData){
            if(protocol) orderData.protocol = protocol;
            if(url) orderData.url = url;
            if(method) orderData.method = method;
            if(successCodes) orderData.successCodes = successCodes;
            if(timeoutSeconds) orderData.timeoutSeconds = timeoutSeconds;

            _data.update('orders',orderID,orderData,(err)=>{
              if(!err){
                // Update the orders data set with the provided edits
                workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Updated order`,'payload': {'reqPkg': reqPkg}});
                callback(200);
              } else {
                workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to save the provided data set`,'payload': {'reqPkg': reqPkg}});
                callback(500,{'Error':'Failed to save the provided data set'});
              }
            });
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Failed to find the requested order data.`,'payload': {'reqPkg': reqPkg}});
            callback(418, {'Error':'Failed to find the requested order data.'});
          }
        });
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Unauthorized to access this data`,'payload': {'reqPkg': reqPkg}});
        callback(418, {'Error': 'Unauthorized to access this data'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Request is missing valid data`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error': 'Request is missing valid data'});
  }

}

// ./orders [DELETE]
// Required: id
// Optional: N/A
handlers._orders.DELETE = (reqPkg, callback)=>{
  // Get the id from the query string
  let orderID = (typeof(reqPkg.payload.id) == 'string') ? reqPkg.payload.id : false;
  // Get the token and email from the header
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;

  if(orderID && token && email){
    // Verify that the token is valid for this request
    handlers._tokens.verifyToken(token, orderData.userEmail, (tokenIsValid)=>{
      if(tokenIsValid){
        // Lookup the check
        _data.read('orders',orderID, (err,orderData)=>{
          if(!err && orderData){
            // Delete the specified check data
            _data.delete('orders', orderID, (err)=>{
              if(!err){
                // Lookup the user
                _data.read('users',email, (err, userData)=>{
                  if(!err && userData){
                    let userorders = (typeof(userData.orders) == 'object' && userData.orders instanceof Array) ? userData.orders : [];

                    // Remove the deleted check from their list of orders
                    let checkPos = userorders.indexOf(orderID);
                    if(checkPos > -1){
                      userorders.splice(checkPos,1);
                      // Update the userData object to reflect deletion
                      userData.orders = userorders;
                      // Re-save the user's check data
                      _data.update('users',email, userData, (err)=>{
                        if(!err){
                          workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`User updated`,'payload': {'reqPkg': reqPkg}});
                          callback(200);
                        } else {
                          workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Could not update the user`,'payload': {'reqPkg': reqPkg}});
                          callback(500, {'Error': 'Could not update the user'});
                        }
                      });
                    } else {
                      workers.log('ERR',{'src': reqPkg.src.forLogging, 'msg':`Failed to find specified check in the user\'s data`,'payload': {'reqPkg': reqPkg}});
                      callback(404, {'Error':'Failed to find specified check in the user\'s data'});
                    }
                  } else {
                    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Failed to find user associated with the deleted check data`,'payload': {'reqPkg': reqPkg}});
                    callback(418,{'Error':'Failed to find user associated with the deleted check data'});
                  }
                });
              } else {
                workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to delete specified user\'s check data`,'payload': {'reqPkg': reqPkg}});
                callback(500, {'Error':'Failed to delete specified user\'s check data'});
              }
            });
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Failed to fetch the requested check data`,'payload': {'reqPkg': reqPkg}});
            callback(418, {'Error':'Failed to fetch the requested check data'});
          }
        });
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Unauthorized to access data set`,'payload': {'reqPkg': reqPkg}});
        callback(418, {'Error':'Unauthorized to access data set'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field data`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error':'Missing required field data'});
  }
}

handlers.notFound = (reqPkg, callback)=>{
  let resPkg = {};
  resPkg.handler = 'notFound';
  resPkg.payload = 'You are attempting to brew coffee.';

  workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Requested path not found`,'payload': {'reqPkg': reqPkg}});
  callback(418, resPkg);
}

// ./ping
handlers.ping = (reqPkg, callback) => {
  workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Ping!`,'payload': {'reqPkg': reqPkg}});
  callback(200);
}

// ./users
handlers.users = (reqPkg, callback)=>{
  const acceptableMethods = ['POST','GET','PUT','DELETE'];
  if(acceptableMethods.indexOf(reqPkg.method) > -1){
    handlers._users[reqPkg.method](reqPkg,callback);
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Invalid method used`,'payload': {'reqPkg': reqPkg}});
    callback(418,{'Error':'Method not allowed.'});
  }
}

// Container for users submethods
handlers._users = {};

// ./users [POST]
// Required: firstName, lastName, email, password
// Optional: N/A
handlers._users.POST = (reqPkg,callback) => {
  // Check that all required fields are filled out
  let firstName = (typeof(reqPkg.payload.firstName) == 'string' && reqPkg.payload.firstName.trim().length > 0) ? reqPkg.payload.firstName.trim() : false;
  let lastName = (typeof(reqPkg.payload.lastName) == 'string' && reqPkg.payload.lastName.trim().length > 0) ? reqPkg.payload.lastName.trim() : false;
  let email = (typeof(reqPkg.payload.email) == 'string') ? helpers.validateEmailAddress(reqPkg.payload.email) : false;
  let address = (typeof(reqPkg.payload.address) == 'object') ? helpers.validateAddress(reqPkg.payload.address) : false;
  let password = (typeof(reqPkg.payload.password) == 'string' && reqPkg.payload.password.trim().length > 0) ? reqPkg.payload.password.trim() : false;

  if(firstName && lastName && email && address && password && tosAgreement){
    _data.read('users',email,(err,data)=>{
      if(err){
        // Hash the password
        let hashedPassword = helpers.hash(password);
        if(!hashedPassword) {
          workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Could not create the named user`,'payload': {'reqPkg': reqPkg}});
          callback(500, {'Error': 'Could not create the named user'});
        }
        else {
          // Create the user object
          let userObject = {
            'firstName': firstName,
            'lastName': lastName,
            'email': email.toLowerCase(),
            'address': address,
            'hashedPassword': hashedPassword,
            'tosAgreement': true
          }

          // Store the user
          _data.create('users',email,userObject, (err)=>{
            if(!err){
              workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`New user created`,'payload': {'reqPkg': reqPkg}});
              callback(200);
            } else {
              workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Could not create the new user`,'payload': {'reqPkg': reqPkg}});
              callback(500,{'Error': 'Could not create the new user'})
            }
          });
        }
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`A user with that email already exists.`,'payload': {'reqPkg': reqPkg}});
        callback(500, {'Error': 'A user with that email already exists.'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required fields.`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error': 'Missing required fields.'});
  }
}

// ./users [GET]
// Required: email
// Optional: N/A
handlers._users.GET = (reqPkg,callback) => {
  // Check that the email number is valid
  let email = (typeof(reqPkg.headers.email) == 'string') ? helpers.validateEmailAddress(reqPkg.headers.email) : false;
  // Get the token from the Headers
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;
  if(email && token) {

    // Verify that the given token is valid for the email number provided
    handlers._tokens.verifyToken(token, email, (token_is_valid)=>{
      if(token_is_valid){
        // Lookup the user
        _data.read('users',email, (err,data)=>{
          if(!err && data){
            // Remove the hashed password from the user object before return it in the response
            delete data.hashedPassword;
            workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`User data fetched.`,'payload': {'reqPkg': reqPkg}});
            callback(200,data);
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`No user exists for that record`,'payload': {'reqPkg': reqPkg}});
            callback(418, {'Error': 'No user exists for that record'});
          }
        });
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Required token is missing from the header or is otherwise invalid`,'payload': {'reqPkg': reqPkg}});
        callback(403,{'Error':'Required token is missing from the header or is otherwise invalid'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field`,'payload': {'reqPkg': reqPkg}});
    callback(400,{'Error': 'Missing required field'});
  }
}

// ./users [PUT]
// Required: email
// Optional: firstName, lastName, address, password (at least one is required)
// @TODO: Only let an authenticated user update their own object.  Don't let them update anyone else's.
handlers._users.PUT = (reqPkg,callback) => {
  // Check for the require fields
  let email = (typeof(reqPkg.headers.email) == 'string') ? helpers.validateEmailAddress(reqPkg.headers.email) : false;
  // Get the token from the Headers
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;
  // Check for the optional fields
  let firstName = (typeof(reqPkg.payload.firstName) == 'string' && reqPkg.payload.firstName.trim().length > 0) ? reqPkg.payload.firstName.trim() : false;
  let lastName = (typeof(reqPkg.payload.lastName) == 'string' && reqPkg.payload.lastName.trim().length > 0) ? reqPkg.payload.lastName.trim() : false;
  let address = (typeof(reqPkg.payload.address) == 'object') ? helpers.validateAddress(reqPkg.payload.address) : false;
  let password = (typeof(reqPkg.payload.password) == 'string' && reqPkg.payload.password.trim().length > 0) ? reqPkg.payload.password.trim() : false;

  // Verify all required fields are present
  if(firstName || lastName || address || password && email && token){

    // Verify that the given token is valid for the email number provided
    handlers._tokens.verifyToken(token, email, (token_is_valid)=>{
      if(token_is_valid){
        _data.read('users',email, (err,userData)=>{
          if(!err && userData){
            // Update the core user fields passed with the request.
            if(firstName) userData.firstName = firstName;
            if(lastName) userData.lastName = lastName;
            if(address) userData.address = address;
            if(password) userData.hashedPassword = helpers.hash(password);

            // Update the data store
            _data.update('users',email,userData,(err)=>{
              if(!err){
                workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`User data updated`,'payload': {'reqPkg': reqPkg}});
                callback(200);
              } else {
                workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to update data store`,'payload': {'reqPkg': reqPkg}});
                callback(500,{'Error': 'Failed to update data store'});
              }
            });
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`No such record exists`,'payload': {'reqPkg': reqPkg}});
            callback(418, {'Error': 'No such record exists'});
          }
        });
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Required token is missing from the header or is otherwise invalid`,'payload': {'reqPkg': reqPkg}});
        callback(418,{'Error': 'Required token is missing from the header or is otherwise invalid'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error': 'Missing required field'});
  }
}

// ./users [DELETE]
// Required: email
// Optional: N/A
handlers._users.DELETE = (reqPkg,callback) => {
  // Check that the email number is valid
  let email = (typeof(reqPkg.headers.email) == 'string') ? helpers.validateEmailAddress(reqPkg.headers.email) : false;
  // Get the token from the Headers
  let token = (typeof(reqPkg.headers.token) == 'string') ? reqPkg.headers.token : false;

  if(email && token){

    // Verify that the given token is valid for the email number provided
    handlers._tokens.verifyToken(token, email, (token_is_valid)=>{
      if(token_is_valid){
        _data.read('users',email, (err, userData)=>{
          if(!err && userData){
            _data.delete('users',email, (err)=>{
              if(!err){
                let userorders = (typeof(userData.orders)=='object' && userData.orders instanceof Array) ? userData.orders : [];
                let failedDeletions = 0;
                for(ndx=0;ndx<userorders.length;ndx++){
                    _data.delete('orders',userorders[ndx].id,(err)=>{
                      failedDeletions = (err) ? failedDeletions + 1 : failedDeletions;
                    });
                }
                if(failedDeletions==0){
                  workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Deletion of user data successful`,'payload': {'reqPkg': reqPkg}});
                  callback(200);
                } else {
                  workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to delete ${failedDeletions} orders associated with this user`,'payload': {'reqPkg': reqPkg}});
                  callback(500, {'Error':`Failed to delete ${failedDeletions} orders associated with this user`});
                }
              } else {
                workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to delete the specified user`,'payload': {'reqPkg': reqPkg}});
                callback(500, {'Error': 'Failed to delete the specified user'});
              }
            });
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Could not find the specified user`,'payload': {'reqPkg': reqPkg}});
            callback(418, {'Error': 'Could not find the specified user'});
          }
        });
      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Required token is missing from the header or is otherwise invalid`,'payload': {'reqPkg': reqPkg}});
        callback(418,{'Error': 'Required token is missing from the header or is otherwise invalid'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error': 'Missing required field'});
  }
}



// ./tokens
handlers.tokens = (reqPkg, callback)=>{
  const acceptableMethods = ['POST','GET','PUT','DELETE'];
  if(acceptableMethods.indexOf(reqPkg.method) > -1){
    handlers._tokens[reqPkg.method](reqPkg,callback);
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Invalid method used`,'payload': {'reqPkg': reqPkg}});
    callback(418,{'Error':'Method not allowed.'});
  }
}

// Container for tokens submethods
handlers._tokens = {};

// Verify Access token
handlers._tokens.verifyToken = (tokenID,email,callback)=>{
  // Lookup the token
  _data.read('tokens',email,(err,tokenData)=>{
    if(!err && tokenData){
      // Check that the token is for the given user and not expired
      if(tokenData.id == tokenID && tokenData.expires > Date.now()){
        callback(true);
      } else {
        callback(false);
      }
    } else {
      callback(false);
    }
  });
}

// LOGIN POINT //
// ./tokens [POST]
// Required: email, password
// Optional: N/A
handlers._tokens.POST = (reqPkg,callback) => {
  // Check that all required fields are filled out
  let email = (typeof(reqPkg.payload.email) == 'string') ? helpers.validateEmailAddress(reqPkg.payload.email) : false;
  let password = (typeof(reqPkg.payload.password) == 'string' && reqPkg.payload.password.trim().length > 0) ? reqPkg.payload.password.trim() : false;
  if(email && password){
    // Lookup the user who matches that email number

    _data.read('users',email, (err,userData)=>{
      if(!err && userData){
        // Hash the transmitted password
        let hashed_password = helpers.hash(password);
        debug(`\x1b[32mhashed_password: ${hashed_password}\x1b[0m\n\x1b[33mstored_password: ${userData.hashedPassword}\x1b[0m`)
        if(hashed_password == userData.hashedPassword){
          // Create a new token with a random name, to expire in one hour
          let tokenID = helpers.generateToken(4);
          let expires = Date.now()+1000*60*60;
          let token = {
            'email': email.toLowerCase(),
            'id': tokenID,
            'expires': expires
          };

          _data.create('tokens',email, token, (err)=>{
            if(!err){
              reqPkg.src.user = email;
              reqPkg.src.forLogging = `${email}-${reqPkg.src.reqID}`;
              workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Authorization token created`,'payload': {'reqPkg': reqPkg}});
              callback(200, token);
            } else {
              _data.update('tokens',email, token, (err)=>{
                if(!err){
                  reqPkg.src.user = email;
                  reqPkg.src.forLogging = `${email}-${reqPkg.src.reqID}`;
                  workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Authorization token updated`,'payload': {'reqPkg': reqPkg}});
                  callback(200, token);
                } else {
                  workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to create access token for user`,'payload': {'err':err,'reqPkg': reqPkg}});
                  callback(500,{'Error': 'Failed to create access token for user'});
                }
              })

            }
          });
        } else {
          workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Unauthorized to access the specified record`,'payload': {'reqPkg': reqPkg}});
          callback(418, {'Error':'Unauthorized to access the specified record'});
        }

      } else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`No record exists for that user`,'payload': {'err':err,'reqPkg': reqPkg}});
        callback(418, {'Error': 'No record exists for that user'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field(s)`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error': 'Missing required field(s)'});
  }
}

// ./tokens [GET]
// Required: email
// Optional: N/A
handlers._tokens.GET = (reqPkg,callback) => {
  // Check that the email number is valid
  let tokenID = (typeof(reqPkg.headers.id) == 'string') ? reqPkg.headers.id.trim() : false;
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;
  if(tokenID && email) {
    handlers._tokens.verifyToken(tokenID, email, (tokenIsValid)=>{
      if(tokenIsValid) {
        workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Valid token verified`});
        callback(200);
      }
      else {
        workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Token is invalid`,'payload': {'reqPkg': reqPkg}});
        callback(403, {'Error':'Token is invalid'});
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field`,'payload': {'reqPkg': reqPkg}});
    callback(418,{'Error': 'Missing required field'});
  }
}

// ./tokens [PUT]
// Required: id, extend
// Optional: N/A
handlers._tokens.PUT = (reqPkg,callback) => {
  let tokenID = (typeof(reqPkg.headers.id) == 'string') ? reqPkg.headers.id.trim() : false;
  let extend = (typeof(reqPkg.headers.extend) == 'boolean' && reqPkg.headers.extend == true) ? true : false;
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;
  if(tokenID && extend && email){
    // Validate token for this request
    handlers._tokens.verifyToken(tokenID, email, (tokenIsValid)=>{
      // Lookup the token
      _data.read('tokens',email, (err,tokenData)=>{
        if(!err && tokenData){
          // Check the token's expiration
          if(tokenData.expires > Date.now()){
              // Extend the expiration for another hour
              tokenData.expires = Date.now()+1000*60*60;
              _data.update('tokens',email, tokenData, (err)=>{
                if(!err){
                  workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Token authorization extended`,'payload': {'reqPkg': reqPkg}});
                  callback(200,tokenData);
                } else {
                  workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to update access token`,'payload': {'err': err, 'reqPkg': reqPkg}});
                  callback(500,{'Error': 'Failed to update access token'});
                }
              });
          } else {
            workers.log('INFO',{'src': reqPkg.src.forLogging, 'msg':`Requested token has expired`,'payload': {'reqPkg': reqPkg}});
            callback(401,{'Error': 'Requested token has expired'});
          }
        } else {
          workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Token request invalid`,'payload': {'err': err, 'reqPkg': reqPkg}});
          callback(418, {'Error': 'Token request invalid'});
        }
      });
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing or invalid field(s)`,'payload': {'reqPkg': reqPkg}});
    callback(418, {'Error':'Missing or invalid field(s)'});
  }
}

// LOGOUT POINT //
// ./tokens [DELETE]
// Required: id
// Optional: N/A
handlers._tokens.DELETE = (reqPkg,callback) => {
  let tokenID = (typeof(reqPkg.headers.id) == 'string'&& reqPkg.headers.id.trim().length == 20) ? reqPkg.headers.id.trim() : false;
  let email = (typeof(reqPkg.headers.email) == 'string') ? reqPkg.headers.email : false;
  if(tokenID && email){
    // Verify token is valid for this request
    handlers._tokens.verifyToken(tokenID, email, (tokenIsValid)=>{
      if(tokenIsValid){
        // Lookup the token
        _data.read('tokens',email, (err,tokenData)=>{
          if(!err && tokenData){
            tokenData.id = false;
            _data.update('tokens',email,(err, tokenData)=>{
              if(!err && tokenData){
                workers.log('USER',{'src': reqPkg.src.forLogging, 'msg':`Logout Successful`,'payload': {'reqPkg': reqPkg}});
                callback(200);
              } else {
                workers.log('ERR',{'src': `SYS-${Date.now()}`, 'msg':`Failed to delete access token`,'payload': {'err': err, 'reqPkg': reqPkg}});
                callback(500,{'Error':'Failed to delete access token'});
              }
            });
          } else {
            workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Specified user does not exist`,'payload': {'err': err, 'reqPkg': reqPkg}});
            callback(418,{'Error': 'Specified user does not exist'});
          }
        });
      }
    });
  } else {
    workers.log('PROB',{'src': reqPkg.src.forLogging, 'msg':`Missing required field`,'payload': {'reqPkg': reqPkg}});
    callback(418,{'Error':'Missing required field'});
  }
}


module.exports = handlers;
