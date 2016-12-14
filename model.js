// require
var config = require('./config.json');
var http = require('http');

//Query Params//
var firstPage;
var lastPage; // 0 if you want all results
var pageSize;
var sorted; // asc or desc
var entry;
// var key;
var mode;
var queryString;
var raw = {init:'raw'};

module.exports.countMedia = function(params) {
  firstPage=1;
  lastPage=1;
  pageSize=1;
  sorted='asc';
  entry='search';
  queryString='&db=default&media_type=journal_article&q=genes&term=genes';
  mode='countMedia';

  return Promise.resolve()
  .then(function() { return request(); })
  .then(function(out) {
    console.log("out", out);
    return out; })
	.catch(function(err) { return Error("server.model.countMedia:"+err)})
}

function request() {
  return new Promise(function(resolve, reject) {
    query(firstPage);
    resolve(raw);
  });
}

function query(page) {

	var options = {
		host: 'api.iclikval.riken.jp',
		port: 80,
		path: `/${entry}?page=${page}&page_size=${pageSize + queryString}`,
		method: 'GET',
		headers: {
			'accept': '*/*',
			'Content-Type': 'application/json',
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
  if(mode === "countMedia") {
    raw = data.extra.media_count.media;
  }
}

function end() {
  if(mode === "countMedia") {
    console.log(raw);
    // return Promise.resolve(raw);
  }
}
