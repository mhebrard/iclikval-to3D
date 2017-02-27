// require
var http = require('http');
// var force = require('d3-force');
var hierarchy = require('d3-hierarchy');
var scale = require('d3-scale');
var config = require('../config.json');

var collections = require('./collections.json');

module.exports.count = {
  // data: collections,
  get: function() { return collections; },
  request: function(param) { return countRequest(this, param); },
  updated: function() { collections.updated = new Date(); }
};

function countRequest(count, p) {
  return Promise.resolve().then(() => {
    // query ick: count annots by media
    var param = {group: ['media', 'media_type'], filter: p.filters}; // only1chunts
    return queryCount(param);
  }).then(annots => {
    // save top media
    var top = annots.result[0];
    compareTop(count.get().root.top, top.group.media, top.group.media_type, top.count);

    // console.log('annots[0].group (media + media_type)', annots.result[0].group);
    // console.log('annot[0].count (nb of annots)', annots.result[0].count);
    // console.log('ANNOTS', count.get());

    // group by media type
    return groupBy('media_type', annots.result);
  }).then(types => {
    // console.log('types.length', types.length);
    // console.log('types[0].group (media_type)', types[0].group);
    // console.log('types[0].count (nb of media)', types[0].count);
    // console.log('types[0].items[0].group (media + media_type)', types[0].items[0].group);
    // console.log('types[0].items[0].count (nb of annots)', types[0].items[0].count);
    return countNodes(count.get(), types);
  }).then(() => {
    // console.log('nodes.length', nodes.length);
    // console.log('col.nodes', col.nodes);
    // update date time
    count.updated();
    // console.log("MID", collections.root);
    // compute position
    return toPack(count.get(), p);
  }).then(pack => {
    // console.log('PACK', pack);
    return countPosition(count.get(), pack, p);
  })
  /* .then(() => {
    // Write file for save
  })
  */.then(() => {
    return Promise.resolve(count.get());
  }).catch(err => {
    console.log('countRequest:', err);
  });
}

function compareTop(ctop, ntop, ntype, nannots) {
  // console.log(`if ${nannots} > ${ctop.annots}`);
  if (nannots > ctop.annots) {
    ctop.id = ntop.id;
    ctop.title = ntop.title;
    ctop.annots = nannots;
    ctop.type = ntype;
  }
}

function countNodes(res, data) {
  return new Promise(function(resolve) {
    // Add data nodes in res nodes
    // update top for each nodes

    // map existing nodes
    var nMap = {};
    // var nodes = res.nodes;
    res.nodes.forEach((n, i) => {
      nMap[n.name] = i;
    });

    // add counts
    data.forEach(d => {
      // if node not exist, add node
      if (!nMap[d.group]) {
        nMap[d.group] = res.nodes.length;
        res.nodes.push({
          name: d.group,
          count: 0,
          annots: 0,
          top: {annots: 0}
        });
      }
      // get collections node
      var node = res.nodes[nMap[d.group]];
      // add count
      node.count += d.count;
      res.root.count += d.count;
      // sum annotations from each items
      var sum = d.items.reduce((tot, i) => {
        tot += i.count;
        return tot;
      }, 0);
      node.annots += sum;
      res.root.annots += sum;
      // save top media
      // console.log('ITEMS', d.items[0].count, d.items[1].count, d.items[2].count, d.items[3].count, d.items[4].count);
      var top = d.items[0];
      compareTop(node.top, top.group.media, top.group.media_type, top.count);
    });
    resolve();
  });
}

function toPack(data, p) {
  return new Promise(function(resolve) {
    // create root for pack
    var root = {
      name: data.root.name,
      children: [],
      value: data.root.count,
      node: data.root
    };

    // add nodes
    data.nodes.forEach(n => {
      root.children.push({
        name: n.name,
        value: n.count,
        node: n
      });
    });

    // create pack layout
    var layout = hierarchy.pack()
    .size([p.radius * 2, p.radius * 2]);
    // .padding(2);

    // compute layout
    var nodes = layout(
      hierarchy.hierarchy(root)
      .sum(function(d) { return Math.log(d.value + 2); }) // avoid value = 0
    ).descendants().slice(1);

    resolve(nodes);
  });
}

function countPosition(res, data, p) {
  return new Promise(function(resolve, reject) {
    // scale
    var s = scale.scaleLinear().domain([0, p.radius * 2]).range([-p.radius, p.radius]);
    // nodes
    data.forEach(d => {
      // console.log("D", d);
      var n = d.data.node;
      if (n.name === d.data.name) {
        n.r = d.r;
        n.x = s(d.x);
        n.y = s(d.y);
      } else {
        reject(new Error(`model.js/countPosition: ${n} != ${d.data.name}`));
      }
    });
    resolve();
  });
}

// private variables
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

/* module.exports.toPack = function(param) {
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
    */
    /* GRID */
    /* if(param.grid) {
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
        value:m.r,
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
*/
module.exports.toForce3D = function(graph, params) {
  return new Promise(function(resolve, reject) {
    // init nodes
    // spead on z
    graph.nodes.forEach((f, i) => {
      f.value = Math.log(f.count + 2);
      f.x = f.tx = 0;
      f.vx = f.tvx = 0;
      f.y = 0;
      f.vy = 0;
      f.z = f.tz = i;
      f.vz = f.tvz = 0;
    })

    // create stimul
    var forceXY = force.forceSimulation()
      .nodes(graph.nodes)
      .force('center', force.forceCenter(6,6))
      .force('collide', force.forceCollide()
        .radius(d => d.value)
      )
      .force('link', force.forceLink()
        .links(graph.edges)
        .id(d => d.name)
        // .strength(d => d.count)
      )
      .on('tick', tickedXY)
      .on('end', end)
    ;

    var forceZY = force.forceSimulation()
      .nodes(graph.nodes)
      .force('center', force.forceCenter(6,6))
      .force('collide', force.forceCollide()
        .radius(d => d.value)
      )
      .force('link', force.forceLink()
        .links(graph.edges)
        .id(d => d.name)
        // .strength(d => d.count)
      )
      .on('tick', tickedZY)
      .on('end', end)
    ;
    function tickedXY() {
      // console.log('tick X');
      graph.nodes.forEach(f => {
        //save X
        f.tx = f.x;
        f.tvx = f.vx
        // get z
        f.x = f.tz;
        f.vx = f.tvz;
      });
        // change axes
        forceXY.stop();
        forceZY.restart();
    }

    function tickedZY() {
      // console.log('tick Z');
      graph.nodes.forEach(f => {
        //save z
        f.tz = f.x;
        f.tvz = f.vx
        // get x
        f.x = f.tx;
        f.vx = f.tvx;
      });
      forceZY.stop();
      forceXY.restart();
    }

    function end() {
      console.log('end');
      forceXY.stop();
      forceZY.stop();
      // simplify the edges
      res = graph.edges.map(m => {
        return {source: m.source.name, target:m.target.name, count:m.count, value: Math.log(m.count + 2)};
      })
      graph.edges = res;
      resolve(graph)
    }
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
    // var res = module.exports.galaxy.get();
    var res = {nodes:[], edges:[]};
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
