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

module.exports.countMedia = function(param) {
  firstPage=1;
  lastPage=1;
  pageSize=1;
  sorted='asc';
  entry='search';
  queryString=`&db=default&media_type=journal_article&q=${param.query}&term=${param.query}`;
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

      //Elems are spread on a plan, diameter of a sphere, then mapped on the sphere
      //compute pack layout. (on a plan)
      var radius = param.radius; // pack is computed
      var pack = hierarchy.pack()
      .size([radius*2, radius*2])
      .padding(2);
      // use log(value) because huge range(1,80000);
      // slice the root node (not render)
      var nodes = pack(
        hierarchy.hierarchy(root)
        .sum(function(d) { return Math.log(d.value); })
      ).descendants().slice(1);
      console.log(nodes);

      // map plan to sphere
      // angle of display > PI * degree / 180 > center on 0 > [-a/2, +a/2]
      var angle = Math.PI * param.angle / 180;
      // map x,y from plan to polar,azimut in sphere
      var angular = scale.scaleLinear().domain([0, radius * 2]).range([angle / -2, angle / 2]);
      //format for unity3D light object + x,y,z from spherical coordinate
      var output = nodes.map(m => {
        return {name: m.data.name,
          value: m.data.value,
          r:m.r,
          x:radius * Math.sin(angular(m.y)) * Math.cos(angular(m.x)),
          y:radius * Math.sin(angular(m.y)) * Math.sin(angular(m.x)),
          z:radius * Math.cos(angular(m.y))
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
