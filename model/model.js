// require
var http = require('http');
var hierarchy = require('d3-hierarchy');
var scale = require('d3-scale');
var config = require('../config.json');

//private variables
var universe = {};
module.exports.universe = {
  get: function() { return universe; },
  set: function(u) { universe = u; return u; }
};

module.exports.count = function() {
  console.log('count');
  return Promise.resolve()
  .then(() => {
    var p = {group:['media', 'media_type'], filter:{'reviewer':'tdtaylor', 'year':'2017'}}; //only1chunts
    return queryCount(p);
  }).then(media => {
    return groupBy('media_type', media.result);
  }).then(types => {
    return galaxyNodes(types);
  }).then(obj => {
    module.exports.universe.set(obj);
    var p = {group:['key', 'media_type'], filter:{'reviewer':'tdtaylor', 'year':'2016'}};
    return queryCount(p);
  }).then(annots => {
    return groupBy('key', annots.result);
  }).then(keys => {
    return galaxyEdges(keys);
  }).then(obj => {
    module.exports.universe.set(obj);
    return Promise.resolve();
  })
  /* // options
  .then(() => {
    var p = {group:['reviewer', 'media_type'], filter:{}};
    return queryCount(p);
  }).then(annots => {
    return groupBy('reviewer', annots.result);
  }).then(out => {
    // console.log('option', out);
    return Promise.resolve(out);
  }).then(out => {
    var sel = out.reduce( (res, r) => {
      if (r.count>2) {res.push(r);}
      return res;
    },[]);
    sel.forEach(f => {
      console.log(f.group);
      console.log('\t', f.items);
    })
    // console.log('option', out);
    return Promise.resolve(sel);
  })*/
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

function galaxyEdges(data) {
  return new Promise(function(resolve, reject) {
    var res = module.exports.universe.get();
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

module.exports.toPack = function(param) {
  return new Promise(function(resolve, reject) {
    var univ = module.exports.universe.get();
    // format root for d3
    var root = {name:'root', children:[]};
    var children = Object.keys(univ.nodes).map(m => {
      return {name:univ.nodes[m].name, value:Number(univ.nodes[m].count)};
    });
    root.children = children;

    //Elems are spread on a plan, diameter of a sphere, then mapped on the sphere
    //compute pack layout. (on a plan)
    var radius = param.radius;
    var pack = hierarchy.pack()
    .size([radius*2, radius*2])
    .padding(2);
    // use log(value) because huge range(1,80000);
    // slice the root node (not render)
    var nodes = pack(
      hierarchy.hierarchy(root)
      .sum(function(d) { return Math.log(d.value + 2); }) //avoid value = 0
    ).descendants().slice(1);
    // console.log('pack', nodes);

    // map plan to sphere
    // angle of display > PI * degree / 180
    var angle = Math.PI * param.angle / 180;
    // map x,y from plan to polar,azimut in sphere
    var angular = scale.scaleLinear().domain([0, radius * 2]).range([0, angle]);
    // format for unity3D light object + x,y,z from spherical coordinate
    var output = nodes.map(m => {
      return {name: m.data.name,
        value: m.data.value,
        r:m.r,
        x:radius * Math.sin(angular(m.y)) * Math.cos(angular(m.x)),
        y:radius * Math.sin(angular(m.y)) * Math.sin(angular(m.x)),
        z:radius * Math.cos(angular(m.y))
      }
    });
    // console.log(output);

    // format edges to array
    var edges = Object.keys(univ.edges).map( m => {
      e = univ.edges[m];
      console.log(e);
      return {source: e.source,
        target: e.target,
        count: e.count,
        value: e.count ? Math.log(e.count + 2) : 0 // avoid value = 0 if count != 0
      };
    });
    console.log(edges);

    resolve({nodes:output, edges:edges});
  });
}
