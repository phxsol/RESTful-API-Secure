/*
 * Library for storing and editing data
 *
 */

// Dependencies
let fs = require('fs');
let path = require('path');
let helpers = require('./helpers');
let util = require('util');
let debug = util.debuglog('data');

// Container for the module to exports
let lib = {};

lib.base_dir = path.join(__dirname,'/../.data/');

// Write data to a File
lib.create = (dir,filename,data,callback)=>{
  // Open the file for writing
  fs.open(lib.base_dir+dir+'/'+filename+'.json','wx',(err,file_descriptor)=>{
    if(!err && file_descriptor){
      // Convert data into a string
      let data_string = JSON.stringify(data);

      // Write to file and close it
      fs.writeFile(file_descriptor,data_string, (err)=>{
        if(!err){
          fs.close(file_descriptor, (err)=>{
            if(!err){
              callback(false);
            } else {
              callback('Error closing new file');
            }
          });
        } else {
          callback('Error writing to new file');
        }
      });
    } else {
      callback('Could not create new file, it may already exist.');
    }
  });
};

lib.read = (dir,filename,callback)=>{
  fs.readFile(lib.base_dir+dir+'/'+filename+'.json','utf8',(err,data)=>{
    if(!err && data){
      let parsedData = helpers.parseJSONtoObject(data);
      callback(false, parsedData);
    } else {
      callback(err,data);
    }
  });
}

lib.update = (dir,filename,data,callback)=>{
  fs.open(lib.base_dir+dir+'/'+filename+'.json','r+',(err,file_descriptor)=>{
    if(!err && file_descriptor){
      let data_string = JSON.stringify(data);
      fs.ftruncate(file_descriptor,(err)=>{
        if(!err){
          fs.writeFile(file_descriptor,data_string,(err)=>{
            if(!err){
              fs.close(file_descriptor,(err)=>{
                if(!err){
                  callback(false);
                } else {
                  callback('Error closing file');
                }
              })
            } else {
              callback('Error writing to file.');
            }
          });
        } else {
          callback('Error truncating the existing file');
        }
      });
    } else {
      callback('An error occurred opening an existing file, the file may not in fact exist');
    }
  });
}

lib.delete = (dir,filename,callback)=>{
  // Unlink the file from the filesystem
  fs.unlink(lib.base_dir+dir+'/'+filename+'.json',(err)=>{
    if(!err){
      callback(false);
    } else {
      callback('Error attempting to delete the file');
    }
  });
}

// List all the files in a directory
lib.list = (dir,callback)=>{
  fs.readdir(lib.base_dir+'/'+dir, (err,dirData)=>{
    if(!err && dirData && dirData.length > 0){
      let trimmedFileNames = dirData.map(x => x.replace('.json',''));
      callback(false, trimmedFileNames);
    } else {
      callback(err, dirData);
    }
  });
}

// Export the Data Module
module.exports = lib;
