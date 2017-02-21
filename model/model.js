// require
var http = require('http');
var force = require('d3-force');
var hierarchy = require('d3-hierarchy');
var scale = require('d3-scale');
var config = require('../config.json');

//private variables
var universe = {nodes:[], edges:[]};
var galaxy = {nodes:[], edges:[]};
module.exports.universe = {
  get: function() { return universe; },
  set: function(u) { universe = u; return u; },
  request: function(p) { return universeRequest(p); }
};
module.exports.galaxy = {
  get: function() { return galaxy; },
  set: function(g) { galaxy = g; return g; },
  request: function(p) { return galaxyRequest(p); }
};

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

function universeRequest(param) {
  return Promise.resolve()
  .then(() => {
    var p = {group:['media', 'media_type'], filter:param.filters}; //only1chunts
    return queryCount(p);
  }).then(media => {
    return groupBy('media_type', media.result);
  }).then(types => {
    return universeNodes(types);
  }).then(obj => {
    module.exports.universe.set(obj);
    var p = {group:['key', 'media_type'], filter:param.filters};//{reviewer:'tdtaylor', year:'2017'}};
    return queryCount(p);
  }).then(annots => {
    return groupBy('key', annots.result);
  }).then(keys => {
    return universeEdges(keys);
  }).then(obj => {
    module.exports.universe.set(obj);
    return Promise.resolve();
  })
  .catch( error => {
    console.log('count:', error);
  });
}

function universeNodes(data) {
  return new Promise(function(resolve, reject) {
    var res = module.exports.universe.get();
    res.nodes = data.map(m => {
      return {name:m.group, count:m.count}
    })
    resolve(res);
  });
}

function universeEdges(data) {
  return new Promise(function(resolve, reject) {
    var res = module.exports.universe.get();
    var nList = res.nodes.map(m => {
      return m.name;
    })
    var eMap = {};
    // nodes list
    data.forEach(f => {
      f.items.forEach((g, i) => {
        var source = g.group.media_type;
        // intra link
        if(g.count > 1) {
          // if new
          if(eMap[`${source}_${source}`] === undefined) {
            eMap[`${source}_${source}`] = res.edges.length;
            res.edges.push({source:source, target: source, count:0});
          }
          // count + 1
          var idx = eMap[`${source}_${source}`]
          res.edges[idx].count++;
        }
        // cross links
        if (f.items.length > 1) {
          var sidx = nList.indexOf(source);
          for (j=i+1; j<f.items.length; j++) {
            var target = f.items[j].group.media_type;
            var tidx = nList.indexOf(target);
            var s = Math.min(sidx, tidx);
            var t = Math.max(sidx, tidx);
            // if new
            if(eMap[`${nList[s]}_${nList[t]}`] === undefined) {
              eMap[`${nList[s]}_${nList[t]}`] = res.edges.length;
              res.edges.push({source:nList[s], target:nList[t], count:0});
            }
            // count + 1
            var idx = eMap[`${nList[s]}_${nList[t]}`]
            res.edges[idx].count++;
          }
        }
      });
    });
    nList=0;
    eMap=0;
    resolve(res);
  });
}

module.exports.toPack = function(param) {
  return new Promise(function(resolve, reject) {
    var univ = module.exports.universe.get();
    // format root for d3
    var root = {name:'root', children:[]};
    root.children = univ.nodes;

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
      .sum(function(d) { return Math.log(d.count + 2); }) //avoid value = 0
    ).descendants().slice(1);
    // console.log('pack', nodes);

    /* GRID */
    if(param.grid) {
      nodes.push({ data:{name:'00', value:5}, value:Math.log(5+2), r:0.2, x:0, y:0 })
      nodes.push({ data:{name:'02', value:5}, value:Math.log(5+2), r:0.2, x:0, y:2 })
      nodes.push({ data:{name:'04', value:5}, value:Math.log(5+2), r:0.2, x:0, y:4 })
      nodes.push({ data:{name:'06', value:5}, value:Math.log(5+2), r:0.2, x:0, y:6 })
      nodes.push({ data:{name:'08', value:5}, value:Math.log(5+2), r:0.2, x:0, y:8 })
      nodes.push({ data:{name:'20', value:5}, value:Math.log(5+2), r:0.2, x:2, y:0 })
      nodes.push({ data:{name:'22', value:5}, value:Math.log(5+2), r:0.2, x:2, y:2 })
      nodes.push({ data:{name:'24', value:5}, value:Math.log(5+2), r:0.2, x:2, y:4 })
      nodes.push({ data:{name:'26', value:5}, value:Math.log(5+2), r:0.2, x:2, y:6 })
      nodes.push({ data:{name:'28', value:5}, value:Math.log(5+2), r:0.2, x:2, y:8 })
      nodes.push({ data:{name:'40', value:5}, value:Math.log(5+2), r:0.2, x:4, y:0 })
      nodes.push({ data:{name:'42', value:5}, value:Math.log(5+2), r:0.2, x:4, y:2 })
      nodes.push({ data:{name:'44', value:5}, value:Math.log(5+2), r:0.2, x:4, y:4 })
      nodes.push({ data:{name:'46', value:5}, value:Math.log(5+2), r:0.2, x:4, y:6 })
      nodes.push({ data:{name:'48', value:5}, value:Math.log(5+2), r:0.2, x:4, y:8 })
      nodes.push({ data:{name:'60', value:5}, value:Math.log(5+2), r:0.2, x:6, y:0 })
      nodes.push({ data:{name:'62', value:5}, value:Math.log(5+2), r:0.2, x:6, y:2 })
      nodes.push({ data:{name:'64', value:5}, value:Math.log(5+2), r:0.2, x:6, y:4 })
      nodes.push({ data:{name:'66', value:5}, value:Math.log(5+2), r:0.2, x:6, y:6 })
      nodes.push({ data:{name:'68', value:5}, value:Math.log(5+2), r:0.2, x:6, y:8 })
      nodes.push({ data:{name:'80', value:5}, value:Math.log(5+2), r:0.2, x:8, y:0 })
      nodes.push({ data:{name:'82', value:5}, value:Math.log(5+2), r:0.2, x:8, y:2 })
      nodes.push({ data:{name:'84', value:5}, value:Math.log(5+2), r:0.2, x:8, y:4 })
      nodes.push({ data:{name:'86', value:5}, value:Math.log(5+2), r:0.2, x:8, y:6 })
      nodes.push({ data:{name:'88', value:5}, value:Math.log(5+2), r:0.2, x:8, y:8 })
    }

    // map plan to sphere
    // angle of display > PI * degree / 180
    var angle = Math.PI * param.angle / 180;
    // map x,y from plan to polar,azimut in sphere
    var angular = scale.scaleLinear().domain([0, radius * 2]).range([0, angle]);
    // format for unity3D light object + x,y,z from spherical coordinate
    var output = nodes.map(m => {
      return {name: m.data.name,
        count: m.data.count,
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
      return {source: e.source,
        target: e.target,
        count: e.count,
        value: e.count ? Math.log(e.count + 2) : 0 // avoid value = 0 if count != 0
      };
    });
    resolve({nodes:output, edges:edges});
  });
}

module.exports.toForce3D = function(graph, params) {
  return new Promise(function(resolve, reject) {
    // create stimul
    var forceXY = force.forceSimulation();
    var forceZY = force.forceSimulation();
console.log(1);

  // create forces
  forceXY
    .force('collide', force.forceCollide().radius(d => Math.log(d.count + 2)))
    .force('link', force.forceLink().id(d => d.name));
  forceZY
    .force('collide', force.forceCollide().radius(d => Math.log(d.count + 2)))
    .force('link', force.forceLink().id(d => d.name));
console.log(2);

    //tick
    forceXY.on('tick', tickedXY);
    forceXY.on('end', end);

    forceZY.on('tick', tickedZY);
    forceXY.on('end', end);


    function tickedXY() {
      console.log('tick X');
      forceXY.stop();
      forceZY.restart();
    }

    function tickedZY() {
      console.log('tick Z');
      forceZY.stop();
      forceXY.restart();
    }

    function end() {
      console.log('end');
      forceXY.stop();
      forceZY.stop();
      resolve(graph)
    }
/*
    // assign nodes
    forceXY.nodes(graph.nodes)
      .on('tick', tickedXY())
      .on('stop', end());
    //assign edges
    forceXY.force('link').links(graph.edges);
    // create ZY forces
console.log(3);

    // assign nodes
    forceZY.nodes(graph.nodes)
      .on('tick', tickedZY())
      .on('stop', end());
    //assign edges
    forceZY.force('link').links(graph.edges);
console.log(4);
*/


  /*  function end() {
      console.log('tick end');
      graph.nodes.forEach(f => {
        //get x
        f.x = f.tx;
        //get z
        f.z = f.tz;
      });
      resolve(graph);
    }
    // format output graph

    */
  });
}

function galaxyRequest(param) {
  return Promise.resolve()
  .then(() => {
    var p = {group:['media'], filter:param.filters}; //only1chunts
    return queryCount(p);
  }).then(media => {
    return galaxyNodes(media.result);
  }).then(obj => {
    module.exports.galaxy.set(obj);
    var p = {group:['key', 'media'], filter:param.filters};
    return queryCount(p);
  }).then(annots => {
    return groupBy('key', annots.result);
  }).then(keys => {
    return galaxyEdges(keys);
  }).then(obj => {
    module.exports.galaxy.set(obj);
    // console.log('galaxy in model', obj);
    return Promise.resolve();
  })
  .catch( error => {
    console.log('count:', error);
  });
}

function galaxyNodes(data) {
  return new Promise(function(resolve, reject) {
    var res = module.exports.galaxy.get();
    res.nodes = data.map(m => {
      return {name:m.group.media.id, count:m.count}
    })
    resolve(res);
  });
}

function galaxyEdges(data) {
  return new Promise(function(resolve, reject) {
    var res = module.exports.galaxy.get();
    var nList = res.nodes.map(m => {
      return m.name;
    })
    var eMap = {};
    // nodes list
    data.forEach(f => {
      // cross links
      if (f.items.length > 1) {
        f.items.forEach((obj, i) => {
          var source = obj.group.media.id;
          var sidx = nList.indexOf(source);

          for (j = i + 1; j < f.items.length; j++) {
            var target = f.items[j].group.media.id;
            var tidx = nList.indexOf(target);
            var s = Math.min(sidx, tidx);
            var t = Math.max(sidx, tidx);

            // if new
            if(eMap[`${nList[s]}_${nList[t]}`] === undefined) {
              eMap[`${nList[s]}_${nList[t]}`] = res.edges.length;
              res.edges.push({source:nList[s], target:nList[t], count:0});
            }
            // count + 1
            var idx = eMap[`${nList[s]}_${nList[t]}`]
            res.edges[idx].count++;
          }
        })
      }
    });
    nList=0;
    eMap=0;
    resolve(res);
  });
}
