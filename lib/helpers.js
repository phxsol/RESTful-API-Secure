/*
*   Helpers for letious Tasks
*
*/

let crypto = require('crypto');
let config = require('./config');
let https = require('https');
let queryString = require('querystring');
let util = require('util');
let debug = util.debuglog('helpers');

// Container for all the Helpers
let helpers = {};

helpers.extractTelephone = async (phone_string)=>{
  if(typeof(phone_string) == 'string' && phone_string.length > 0){
    let phone_bits = [...phone_string.matchAll(/^\s*(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})(?: *x(\d+))?\s*$/g)];
    phone_bits=phone_bits[0];
    let phone = {};
    phone.country_code = (typeof(phone_bits[1]) !== 'undefined') ? phone_bits[1] : false;
    phone.area_code  = (typeof(phone_bits[2]) !== 'undefined') ? phone_bits[2] : false;
    phone.exchange = (typeof(phone_bits[3]) !== 'undefined') ? phone_bits[3] : false;
    phone.subscriber  = (typeof(phone_bits[4]) !== 'undefined') ? phone_bits[4] : false;
    phone.extension  = (typeof(phone_bits[5]) !== 'undefined') ? phone_bits[5] : false;
    if(phone.area_code&&phone.exchange&&phone.subscriber) return phone;
    else return false;
    return phone;
  } else {
    return false;
  }
};

// Generate a string of alphanumeric characters of the given length
helpers.generateToken = async (idLength)=>{
  idLength = (typeof(idLength) == 'number' && idLength > 0) ? idLength : false;
  if(idLength){
    const symbolicon = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let sL = symbolicon.length;
    let _token = '';
    for(ndx=1;ndx<=idLength;ndx++){
      _token += symbolicon[Math.floor(Math.random()*sL)];
    }
    return _token;
  } else {
    return false;
  }

};

// Hash a sensitive string into a cryptic one
helpers.hash = async (toBeHashed)=>{
  if(typeof(toBeHashed) == 'string' && toBeHashed.length > 0){
    let hash = crypto.createHmac('sha256',config.hashingSecret).update(toBeHashed).digest('hex');
    return hash;
  } else {
    return false;
  }
};

// Parse a JSON string to an object in all cases, without throwing
helpers.parseJSONtoObject = async (buffer)=>{
  try{
    let obj = JSON.parse(buffer);
    return obj;
  } catch(e){
    return {};
  }
};

// Send an SMS message via the Twilio API
helpers.sendTwilioSMS = async (phone, msg, callback)=>{
  // Validate parameters
  phone = (typeof(phone)=='string') ? helpers.extractTelephone(phone.trim()) : false;
  msg = (typeof(msg)=='string') ? msg.trim() : false;
  if(phone && msg){
    if(msg.length <= 1600){
      // Configure the request package
      let reqPkg = {
        'From': config.twilio.fromPhone,
        'To': `+${(phone.country_code)  || 1}${phone.area_code}${phone.exchange}${phone.subscriber}`,
        'Body': msg
      };

      // Stringify the package
      let reqPkg_string = queryString.stringify(reqPkg);

      // Configure the request details
      let requestDetails = {
        'protocol':'https:',
        'hostname':'api.twilio.com',
        'method':'POST',
        'path':'/2010-04-01/Accounts/'+config.twilio.accountSID+'/Messages.json',
        'auth':config.twilio.accountSID+':'+config.twilio.authToken,
        'headers':{
          'Content-Type':'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(reqPkg_string)
        }
      };

      // Instantiate the request object
      let req = https.request(requestDetails, (res)=>{
        // Grab the status of the sent request
        let status = res.statusCode;
        // Callback successfully if the request went through
        if(status == 200 || status == 201)
        {
          callback(false)
        } else {
          callback(`Status code returned: ${status}`);
        }
      });

      // Bind to the error event so it doesn't get thrown up
      req.on('error', (e)=>{
        callback(e);
      });

      // Add the payload
      req.write(reqPkg_string);

      // Execute the request
      req.end();

    } else {
      callback(`Error : Message length may not exceed 1600 characters total`);
    }
  } else {
    callback(`Error : Missing or invalid fields`);
  }

};

// Support for Base Conversion Calculator
function ConversionError(msg) {
  Error.call(this, msg);
  Error.captureStackTrace(this, arguments.callee);
}
util.inherits(ConversionError, Error);
exports.ConversionError = ConversionError;
// Custom alphabet validator
getStdSet = (b)=>{
  if (typeof b == 'string') {
    if (b.length == 0) {
      throw new ConversionError("Empty alphabet");
    }
    return b;
  } else if (b <= 36) {
    // This case does not exist, we should have used native conversion
    throw new ConversionError("Unexpected call to getAlphabet(" + n + ")");
  } else if (b == 62) {
    b = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  } else if (typeof b == 'number') {
    throw new ConversionError("Unknown numeric base, provide alphabet");
  }

  return b;
}

// Generate a randomized symbol base for the Conversion Calculator
helpers.generateSymbolSet = async (n, exclude)=>{
  let safe_symbol_base_string = `0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-._~()'!*:@,;`;
  let safe_symbol_base = safe_symbol_base_string.split("");
  if(typeof(exclude) == 'string'){
    for(ndx=0;ndx<exclude.length;ndx++){
      let char_to_exclude = exclude[ndx];
      if(safe_symbol_base.indexOf(char_to_exclude)>-1){
        safe_symbol_base.splice(safe_symbol_base.indexOf(char_to_exclude),1);
      }
    }
  }
  if(typeof(n) == 'number' && n <= 75 && n > 0){
    if(n<=safe_symbol_base.length){
      let alphabet = '';
      for(ndx=0;ndx<n;ndx++){
        let char_pos = Math.floor(Math.random() * safe_symbol_base.length);
        alphabet += safe_symbol_base.splice(char_pos, 1);
      }
      return alphabet;
    } else {
      throw new ConversionError("Too many symbols excluded for the specified base");
    }
  } else {
    throw new ConversionError("Invalid base specified. 1 - 75 allowed.");
  }
}

// Base 10-to-N Conversion Calculator
helpers.base10TobaseN = async (n, b, uniqueSet)=>{
  if (typeof n != 'number') {
    throw new ConversionError("Expected valid number");
  }
  if (typeof b == 'number' && b > 1 && b <= 36) {
    // Fallback to native base conversion
    return n.toString(b);
  }
  b = (uniqueSet) ? uniqueSet : getStdSet(b);
  var result = '';
  var bLen = b.length;
  if(n == 0) result = b[0];
  while (n != 0) {
    var q = n % bLen;
    result = b[q] + result;
    n = (n - q) / bLen;
  }

  return result;
}

// Base N-to-10 Conversion Calculator
helpers.baseNTobase10 = async (n, b, uniqueSet)=>{
  n = n.toString();
  if (typeof b == 'number' && b > 1 && b <= 36) {
    // Fallback to native base conversion
    return parseInt(n, b);
  }
  b = (uniqueSet) ? uniqueSet : getStdSet(b);
  var cache_pos = {};
  var bLen = b.length;
  var result = 0;
  var pow = 1;
  for (var i = n.length-1; i >= 0; i--) {
    var c = n[i];
    if (typeof cache_pos[c] == 'undefined') {
      cache_pos[c] = b.indexOf(c);
    }
    result += pow * cache_pos[c];
    pow *= bLen;
  }
  return result;
}


module.exports = helpers;
