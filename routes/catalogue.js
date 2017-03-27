// var path = require('path');
// var config = require('../config.json');
var express = require('express');
var model = require('../model/model.js');

var router = express.Router();

router.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

router.post('/', [require('../middlewares/authentify')], (req, res) => {
  // console.log('Catalogue');
  console.log('Catalogue', req.body.media, req.body.media_type);
  model.catalogue.request(req.body).then(data => {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify(data));
  });
});

module.exports = router;
