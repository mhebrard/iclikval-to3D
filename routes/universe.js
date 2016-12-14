var express = require('express');
var path = require('path');
var http = require('http');
var config = require('../config.json');
var router = express.Router();

//Query Params//
/* var firstPage = 1;
var lastPage = 1; // 0 if you want all results
var pageSize = 1;
var sorted = 'asc'; // asc or desc
// var file = './ick-dump-gene-journal.json';
// media
var entry = 'search';
var key = 'media';
var queryString = '&db=default&media_type=journal_article&q=genes&term=genes';

*/var result = {test:"empty"};
/*
function query(page) {

	var options = {
		host: 'api.iclikval.riken.jp',
		port: 80,
		path: `/${entry}?page=${page}&page_size=${pageSize + queryString}`,
		method: 'GET',
		headers: {
*///			'accept': '*/*',
/*			'Content-Type': 'application/json',
	    'Authorization': `Bearer ${config.token}`
		}
	}

	var req = http.request(options, res => {
		// console.log(options);
		res.setEncoding('utf8');
	  var body = '';
	  res.on('data', function(chunk){
	      body += chunk;
	  });
	  res.on('end', function(){
				receive(JSON.parse(body));
	      // console.log("Got a response: ", fbResponse);
	  });
	});
	req.on('error', function(e){
	      console.log("error: ", e);
	});
	req.end();
}

function receive(data) {
	if (sorted === 'desc') { // 1st page
		sorted = 'bottomTop'
		console.log(`from page ${data.page_count} to ${lastPage}`);
		query(data.page_count);
	} else {
		action(data)
		// recursive call
		if (sorted === 'asc') {
			if(data.page < data.page_count && (lastPage>0 ? data.page<lastPage : true) ) { //if lastPage="", read all
				query(data.page + 1);
			} else {
				end();
			}
		}	else { // bottomTop
			if(data.page > 1 && data.page > lastPage) {
				query(data.page - 1);
			} else {
				end();
			}
		}
	}
}

function action(data) {
	// action
	// console.log(data);
  result = data;
*/	/*data._embedded[key].forEach(a => {
		fs.appendFile(file, JSON.stringify(a)+',\n', err => {
			if(err) { console.log(err); }
		});
		// console.log(a.id);
	})
  */
/*	console.log(`page ${data.page} / ${data.page_count}`);
}

function end() {
*/	/*fs.appendFile(file, ']\n', err => {
		if(err) {console.log(err);}
	});
*/
/*	console.log('END');
}
*/

router.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});


router.post('/',[require('../middlewares/authentify')],function(req,res) {
	console.log('UNIVERSE');
  // query(firstPage);
	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*'
	});
	res.end(JSON.stringify(result));
});

router.get('/',function(req,res) {
	console.log('get UNIVERSE');
	res.writeHead(200, {
		'Content-Type': 'application/json',
		'Access-Control-Allow-Origin': '*'
	});
	res.end(JSON.stringify({test:'test'}));
});

module.exports = router;
