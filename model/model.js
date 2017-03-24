// require
var http = require('http');
var request = require('request');
// var force = require('d3-force');
var hierarchy = require('d3-hierarchy');
var scale = require('d3-scale');
var config = require('../config.json');

// global variable for catalogue loop //
var previousMedia = '';
var annotPage = 1;
var annotPageSize = 25;
var annotLastPage = 1;
var annotMax = 1;
var annotCount = 0;
var annotList = [];
var annotIdx = 0;
var searchPage = 1;
var searchPageSize = 25;
var searchLastPage = 1;
var searchCount = 0;
var searchMax = 1;
var mediaList = [];
var loop = false;

var collections = require('./collections.json');
var catalogue = require('./catalogue.json');

module.exports.count = {
  // data: collections,
  get: function() { return collections; },
  request: function(param) { return countRequest(this, param); },
  layout: function(param) { return toCircle(this.get(), param); },
  updated: function() { this.get().updated = new Date(); }
};

module.exports.getTree = function(p) {
  return Promise.resolve().then(() => {
    var action;
    // test media
    if (p.media === '') {
      console.log('media null');
      var param = {};
      if (p.media_type) {
        console.log('type', p.media_type);

        // request ick search 1 media of good type
        // param...
      } else {
        // request ick serch 1 media
        // param...
      }
      // action = querySearch(param);
    } else {
      // var empty = {};
      // action = Promise.resolve(empty + p.media);
    }

    return action;
  }).then(res => {
    p.media = res; // extract p.media from response
    console.log('media', p.media);
    var action;
    if (p.media === undefined) {
      // return empty response
      mediaList = catalogue.mediaList;
      action = Promise.resolve({_embedded: {media: []}});
      loop = false;
    } else {
      // test if same media
      if (!previousMedia || previousMedia !== p.media) {
        action = catalogueNewMedia(p)
        .then(() => catalogueNewAnnotList())
        .then(() => catalogueRequestAnnot(p));
      } else {
        // same media
        annotIdx++;
        if (annotIdx < annotList.length) {
          // next annot in saved list
          action = catalogueRequestAnnot(p);
        } else {
          // finish current annotPage
          annotPage++;
          if (annotPage <= annotLastPage) {
            action = catalogueNewAnnotList()
            .then(() => catalogueRequestAnnot(p));
          } else {
            // return empty response
            action = Promise.resolve({_embedded: {media: []}});
            loop = false;
          }
        }
        // *********************** //
      }
    }
    return action;
  }).then(res => {
    console.log('responses: ', res.total_items);
    var action;
    if (res._embedded.media.length > 0) {
      // count
      if (searchMax < res.total_items) {
        searchMax = res.total_items;
      }
      //
      action = catalogueAddMedia(res._embedded.media, p);
    } else {
      action = Promise.resolve(mediaList);
    }
    // new media to add on the layout
    // console.log(res._embedded.media);
    return action;
  }).then(nodes => {
    // console.log('node:', nodes);
    // compute coords
    return toSpiral(nodes, p);
  }).then(res => {
    // console.log('card:', res);
    // send list to unity
    var out = Object.assign(res, {
      currentSearch: searchCount,
      maxSearch: searchMax,
      currentAnnot: annotCount,
      maxAnnot: annotMax,
      loop: loop
    });
    return Promise.resolve(out);
  }).catch(err => {
    return Error(`getTree: ${err}`);
  });
};

function catalogueNewMedia(p) {
  return new Promise(resolve => {
    previousMedia = p.media;
    annotPage = 1;
    annotCount = 0;
    // annotMax = 1;
    searchPage = 1;
    searchCount = 0;
    // searchMax = 1;
    mediaList = [];
    loop = true;
    resolve();
  }).catch(err => {
    return Error(`catalogueNewMedia: ${err}`);
  });
}

function catalogueNewAnnotList() {
  var param = {media: previousMedia, page: annotPage, page_size: annotPageSize};
  return queryAnnot(param)
  .then(res => {
    annotList = res._embedded.annotation;
    annotIdx = 0;
    annotLastPage = res.page_count;
    annotMax = res.total_items;
    return Promise.resolve();
  }).catch(err => {
    return Error(`catalogueNewAnnotList: ${err}`);
  });
}

function catalogueRequestAnnot(p) {
  annotCount++;
  var a = annotList[annotIdx];
  var q = {
    filter: [
      {field: 'key', type: 'eq', value: a.key, where: 'and'},
      {field: 'relationship', type: 'eq', value: a.relationship, where: 'and'},
      {field: 'value', type: 'eq', value: a.value, where: 'and'}
    ]
  };
  var param = {
    db: 'default',
    q: JSON.stringify(q),
    term: `api: ${a.key}, ${a.relationship}, ${a.value}`,
    page: searchPage,
    page_size: searchPageSize
  };
  if (p.media_type) {
    param.media_type = p.media_type;
    param.term += ` & type=${p.media_type}`;
  }

  console.log(param.term);
  return querySearch(param)
  .catch(err => {
    return Error(`catalogueRequestAnnot: ${err}`);
  });
}

function catalogueAddMedia(data, p) {
  return new Promise(resolve => {
    // console.log('d', data[0]);
    // aggregate Media + occurence count
    // map existing nodes
    var nMap = {};
    mediaList.forEach((f, i) => {
      nMap[f.media.id.toString()] = i;
    });
    // console.log('nMap', nMap);
    // aggregate
    data.forEach(d => {
      var id = d.id.toString();
      // filter by type
      if (!p.media_type || d.media_type === p.media_type) {
        // if node not exist, add node
        if (nMap[id] === undefined) {
          nMap[id] = mediaList.length;
          mediaList.push({
            media: {
              id: id,
              title: d.title,
              type: d.media_type,
              annots: d.auto_annotation_count + d.user_annotation_count
            },
            occur: 0,
            autoAnnot: d.auto_annotation_count,
            userAnnot: d.user_annotation_count
          });
        }
        // occur +1
        mediaList[nMap[id]].occur++;
        // console.log('add', id, 'idx', nMap[id], 'occur', mediaList[nMap[id]].occur);
      }
    });

    // extract root
    var ref = mediaList.splice(nMap[p.media], 1);
    // sort by occurence
    var sorted = mediaList.sort((a, b) => {
      return b.occur - a.occur;
    });
    // add root on top
    sorted.unshift(ref[0]);
    // update mediaList
    mediaList = sorted;

    // count
    searchCount = mediaList.length;

    resolve(mediaList);
  }).catch(err => {
    return Error(`catalogueAddMedia: ${err}`);
  });
}

function countRequest(count, p) {
  return Promise.resolve().then(() => {
    // query ick: count annots by media
    // var param = {group: ['media', 'media_type'], filter: p.filters}; // only1chunts
    // return queryCount(param);

    // query ick: count media by media_type
    var q = {
      filter: [
        {field: 'key', type: 'eq', value: 'title', where: 'and'}
      ]
    };
    var param = {
      db: 'default',
      q: JSON.stringify(q),
      term: 'api: title',
      page: 1,
      page_size: 1
    };

    console.log(param.term);
    return querySearch(param);
  }).then(res => {
    var action;
    if (res._embedded.media.length > 0) {
      // save new count
      action = countNodes(count, res);
      /* .then(data ={
        // count.update();
        // Write file for save
      }); */
    } else {
      action = Promise.resolve(count.get());
    }

    return action;
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

    // count.updated();
    resolve();
  });
}

function toPack(data, p) {
  return new Promise(function(resolve, reject) {
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
        // node: n
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

    // scale
    var s = scale.scaleLinear().domain([0, p.radius * 2]).range([-p.radius, p.radius]);

    // assign positions
    nodes.forEach((n, i) => {
      var d = data.nodes[i];
      if (d.name === n.data.name) {
        d.r = n.r;
        d.x = s(n.x);
        d.y = s(n.y);
      } else {
        reject(new Error(`model.js/countPosition: ${n.data.name} != ${d.name}`));
      }
    });
    resolve(data);
  });
}

function toCircle(data, p) {
  return new Promise(function(resolve, reject) {
    // create root for pack
    var root = {
      name: data.root.name,
      children: [],
      value: 0
    };
    // add nodes
    data.nodes.forEach(n => {
      root.children.push({
        name: n.name,
        value: n.count
        // node: n
      });
    });

    // create pack layout
    var layout = hierarchy.partition();
    // .size([p.radius * 2, p.radius * 2]);
    // .padding(2);

    // compute layout
    var chart = layout(
      hierarchy.hierarchy(root)
      .sum(function(d) { return Math.log(d.value + 2); }) // avoid value = 0
    );

    // scale
    var x = scale.scaleLinear().domain([0, 1]).range([0, 2 * Math.PI]);
    var y = scale.scaleLinear().domain([0, 1]).range([0, p.radius]);

    // position root
    pos(data.root, chart.descendants()[0]);
    // position nodes
    // assign positions
    chart.descendants().slice(1).forEach((n, i) => {
      var d = data.nodes[i];
      pos(d, n);
    });
    // resolve
    // console.log('toCircle end: ', data);
    resolve(data);

    function pos(d, n) {
      if (d.name === n.data.name) {
        // center
        var c = {
          x: (n.x0 + n.x1) / 2,
          y: (n.y0 + n.y1) / 2
        };
        d.r = y((n.x1 - n.x0) / 2);
        // d.x = x(c.x) * Math.cos(y(c.y));
        // d.y = x(c.x) * Math.sin(y(c.y));
        d.x = p.radius * Math.cos(x(c.x));
        d.y = p.radius * Math.sin(x(c.x));
        // console.log(`${d.name}: [${d.x},${d.y}], r:${d.r}`);
      } else {
        reject(new Error(`model.js/countPosition: ${n.data.name} != ${d.name}`));
      }
    }
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
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

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
            resolve(result);
          }
        } catch (err) {
          reject(Error('annot-count parse', err));
        }
      });
    });
    req.on('error', err => {
      reject(Error('annot-count request', err));
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
      if (!group[k]) {
        group[k] = [];
      }
      group[k].push(f);
    });
    // obj to array
    var res = Object.keys(group).map(m => {
      return {group: m, items: group[m], count: group[m].length};
    });
    // return
    resolve(res);
  });
}

function queryAnnot(p) {
  // reviewer, media, key, value, relationship, language, source, media_type, media_title, since, until, sort
  return new Promise(function(resolve, reject) {
    var options = {
      url: 'http://api.iclikval.riken.jp/annotation',
      qs: p,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`
      }
    };

    function callback(err, res, body) {
      if (!err && res.statusCode === 200) {
        var data = JSON.parse(body);
        resolve(data);
      } else {
        reject(Error(`queryAnnot: -${res.statusCode}- ${err}`));
      }
    }

    request(options, callback);
  });
}

function querySearch(p) {
  return new Promise(function(resolve, reject) {
    var options = {
      url: 'http://api.iclikval.riken.jp/search',
      qs: p,
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${config.token}`
      }
    };

    function callback(err, res, body) {
      if (!err && res.statusCode === 200) {
        var data = JSON.parse(body);
        resolve(data);
      } else {
        // empty
        var empty = {_embedded: {media: []}};
        resolve(empty);
        // Error(`queryAnnot: -${res.statusCode}- ${err}`));
      }
    }

    request(options, callback);
  });
}

function treeNodes(data, p) {
  return new Promise(function(resolve) {
    // console.log('annot', data[0]);
    console.log('treeNodes', data[0]);

    // aggregate Media + occurence count
    // map existing nodes
    var nMap = {};
    var res = [];

    // aggregate
    data.forEach(d => {
      // filter by type
      if (!p.media_type || d.media_type === p.media_type) {
        // if node not exist, add node
        if (!nMap[d.id]) {
          nMap[d.id] = res.length;
          res.push({
            media: {
              id: d.id,
              title: d.title,
              type: d.media_type,
              annots: d.auto_annotation_count + d.user_annotation_count
            },
            occur: 0,
            autoAnnot: d.auto_annotation_count,
            userAnnot: d.user_annotation_count
          });
        }
        // occur +1
        res[nMap[d.id]].occur++;
      }
    });

    // extract root
    var ref = res.splice(nMap[p.media], 1);

    // sort by occurence
    var sorted = res.sort((a, b) => {
      return b.occur - a.occur;
    });
    // console.log('treeNodes', sorted[0]);
    // console.log('treeNodes', sorted[1].occur);
    // console.log('treeNodes', '...');
    // console.log('treeNodes', sorted[sorted.length - 1].occur);

    // add toot on top
    sorted.unshift(ref[0]);
    console.log('sorted', sorted[0]);
    console.log('sorted', sorted[1]);

    resolve(sorted);
  }).catch(err => {
    return Error(`treeNode: ${err}`);
  });
}

function toSpiral(data, p) {
  return new Promise(function(resolve) {
    var res = {cards: []};
    // Spiral of Theodorus (Square Root Spiral)
    // first isoscele right triangle of 1 unit
    // each next position depend of the indice n

    var a = 0; // angle at Origin, sum of each triangle
    var r = 0; // radius of point n;
    res.cards = data.map((d, i) => {
      r = p.kr * Math.sqrt(i + 1); // radius
      var c = Object.assign(d, {
        x: r * Math.cos(a),
        y: r * Math.sin(a)
      });
      a += p.ka * Math.atan(1 / Math.sqrt(i + 1));
      return c;
    });

    resolve(res);
  }).catch(err => {
    return Error(`toSpirale: ${err}`);
  });
}

/* ////////////////////////////// */
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
