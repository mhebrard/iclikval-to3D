// require
var config = require('./config.json');
var http = require('http');
var hierarchy = require('d3-hierarchy');
var scale = require('d3-scale');

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
  .then(function() {
    return new Promise(function(resolve, reject) {
      query(firstPage, resolve);
    });
  })
  .then(function(out) {
    return new Promise(function(resolve, reject) {
      //format root for d3
      var root = {name:'root', children:[]};
      var children = Object.keys(out).map(m => {
        return {name:m, value:out[m]};
      });
      root.children = children;

      //format pack
      // var diameter = 500;
      var pack = hierarchy.pack()
      .size([100, 60])
      .padding(2);

      var nodes = pack(
        hierarchy.hierarchy(root)
        //Math.log10(x)
        .sum(function(d) { return Math.log10(d.value); })
        // .sum(function(d) { return d.value })
      ).descendants().slice(1);
      console.log(nodes);
      //map 2D to 3D
      var azimut = scale.scaleLinear().domain([0,1]).range([-50,50]);
      var polar = scale.scaleLinear().domain([0,1]).range([-30,30]);
      var radius = 4;
      //format for unity3D
      var output = nodes.map(m => {
        return {name: m.data.name,
          value: m.data.value,
          r:m.r,
          x:radius * Math.sin(polar(m.y)) * Math.cos(azimut(m.x)),
          y:radius * Math.sin(polar(m.y)) * Math.sin(azimut(m.x)),
          z:radius * Math.cos(polar(m.y))
        }
      });
      resolve({galaxies:output});
    });
  })
  .then(function(out) {
    console.log("out", out);
    return out; })
	.catch(function(err) { return Error("server.model.countMedia:"+err)})
}

function query(page, callback) {

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
				receive(JSON.parse(body), callback);
	      // console.log("Got a response: ", fbResponse);
	  });
	});
	req.on('error', function(e){
	      console.log("error: ", e);
	});
	req.end();
}

function receive(data, callback) {
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
				callback(raw);
			}
		}	else { // bottomTop
			if(data.page > 1 && data.page > lastPage) {
				query(data.page - 1);
			} else {
				 callback(raw);
			}
		}
	}
}

function action(data) {
  if(mode === "countMedia") {
    raw = data.extra.media_count.media;
  }
}
