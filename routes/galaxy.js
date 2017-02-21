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
  // build the filters
  req.body.filters = {};
  req.body.filters.year = '2017';
  if (req.body.type) {
    req.body.filters['media_type'] = req.body.type;
  }
  model.galaxy.request(req.body)
  .then(function() {
    var g = model.galaxy.get();
    console.log('Galaxy Nodes Count', g.nodes.length)
		console.log('Galaxy Node[0]', g.nodes[0]);
		console.log('Galaxy Edges Count', g.edges.length)
		console.log('Galaxy Node[0]', g.edges[0]);

    return model.toForce3D(g);
  }).then(data => {
    console.log('AFTER Forces');
    console.log('Galaxy Nodes Count', data.nodes.length)
		console.log('Galaxy Node[0]', data.nodes[0]);
    console.log('Galaxy Node[1]', data.nodes[1]);
		// console.log('Galaxy Edges Count', data.edges.length)
		// console.log('Galaxy Node[0]', data.edges[0]);
		// console.log('SEND galaxy');
	  res.writeHead(200, {
  		'Content-Type': 'application/json',
  		'Access-Control-Allow-Origin': '*'
	  });
	  res.end(JSON.stringify(data));
  }, function(err){console.log(err);});
});

module.exports = router;
