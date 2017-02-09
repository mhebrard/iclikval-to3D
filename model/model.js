// require
var http = require('http');
var config = require('../config.json');

module.exports.count = function() {
  console.log('count');
  var galaxy = {};
  return Promise.resolve()
  .then(() => {
    var p = {group:['media', 'media_type'], filter:{'reviewer':'tdtaylor', 'year':'2017'}};
    return queryCount(p);
  }).then(media => {
    return groupBy('media_type', media.result);
  }).then(types => {
    return galaxyNodes(types);
  }).then(obj => {
    galaxy = obj;
    var p = {group:['key', 'media_type'], filter:{'reviewer':'tdtaylor'}};
    return queryCount(p);
  }).then(annots => {
    return groupBy('key', annots.result);
  }).then(keys => {
    return galaxyEdges(keys, galaxy);
  })
  .catch( error => {
    console.log('count:', error);
  });
}

function queryCount(p) {
  return new Promise(function(resolve, reject) {
    var data = JSON.stringify(p);
    var options = {
      host: 'api.iclikval.riken.jp',
  		port: 80,
  		path: `/annotation-count`,
  		method: 'POST',
  		headers: {
  			'Accept': 'application/json',
  			'Content-Type': 'application/json',
  	    'Authorization': `Bearer ${config.token}`,
        'Content-Length': Buffer.byteLength(data)
  		}
    }

    var req = http.request(options, res => {
      res.setEncoding('utf8');
      var body = '';
      res.on('data', chunk => {
          body += chunk;
      });
      res.on('end', () => {
        try {
          var result = JSON.parse(body);
          if (result.trace) {
            console.log(result.trace);
            reject(Error('query error'));
          } else {
            resolve(result)
          }
        } catch(err) {
          reject(Error('annot-count parse', err))
        }
      });
    });
    req.on('error', err => {
      reject(Error('annot-count request', err))
    });
    req.write(data);
    req.end();
  });
}

function groupBy(key, data) {
  return new Promise(function(resolve, reject) {
    var group = {};
    data.forEach(f => {
      var k = f.group[key];
      if (!group[k]) { group[k] = []; }
      group[k].push(f);
    });
    // obj to array
    var res = Object.keys(group).map(m =>{
      return {group:m, items:group[m], count:group[m].length};
    });
    // return
    resolve(res);
  });

}

function galaxyNodes(data) {
  return new Promise(function(resolve, reject) {
    var res = {nodes:{}, edges:{}};
    var types = data.map(m => m.group);
    // console.log(types);
    types.forEach((f, i) => {
      res.nodes[f] = {name:f, count: data[i].count};
      for (j=i; j<types.length; j++) {
        res.edges[`${f}_${types[j]}`] = {source:f, target: types[j], count:0};
      }
    })

    resolve(res);
  });
}

function galaxyEdges(data, res) {
  return new Promise(function(resolve, reject) {
    // nodes list
    var nodes = Object.keys(res.nodes);
    data.forEach(f => {
      //intra edge
      f.items.forEach((g, i) => {
        var source = g.group.media_type;
        // intra link
        if(g.count > 1) {
          if(!res.edges[`${source}_${source}`]) {
            res.edges[`${source}_${source}`] = {source:source, target: source, count:0};
          }
          res.edges[`${source}_${source}`].count++;
        }
        // cross links
        if (f.items.length > 1) {
          for (j=i+1; j<f.items.length; j++) {
            var target = f.items[j].group.media_type;
            var sidx = nodes.indexOf(source);
            var tidx = nodes.indexOf(target);
            var s = Math.min(sidx, tidx);
            var t = Math.max(sidx, tidx);

            if(!res.edges[`${nodes[s]}_${nodes[t]}`]) {
              res.edges[`${nodes[s]}_${nodes[t]}`] = {source:nodes[s], target: nodes[t], count:0};
            }
            res.edges[`${nodes[s]}_${nodes[t]}`].count++;
          }
        }
      });
    });
    resolve(res);
  });
}
