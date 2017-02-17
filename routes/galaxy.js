var express = require('express');
var path = require('path');
var config = require('../config.json');
var router = express.Router();
var model = require('../model/model.js');

router.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

router.post('/',[require('../middlewares/authentify')],function(req,res) {
	console.log('GALAXY');
  model.getGalaxy(req.body)
  .then(function(data) {
    //console.log('from route', data);
    //console.log(data[0].group);
    console.log('SEND galaxy');
	  res.writeHead(200, {
  		'Content-Type': 'application/json',
  		'Access-Control-Allow-Origin': '*'
	  });
	  res.end(JSON.stringify(data));
  }, function(err){console.log(err);});
});

module.exports = router;
