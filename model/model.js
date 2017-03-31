// require
var http = require('http');
var request = require('request');
var fs = require('graceful-fs');
var hierarchy = require('d3-hierarchy');
var scale = require('d3-scale');
var config = require('../config.json');

var collections = require('./collections.json');
var catalogue = require('./catalogue.json');

module.exports.count = {
  data: collections,
  get: function() { return this.data; },
  request: function(param) { return countRequest(this, param); },
  layout: function(param) { return toCircle(this.get(), param); },
  update: function() { this.get().updated = new Date(); }
};

module.exports.catalogue = {
  data: catalogue.mediaList,
  pages: {
    currentMedia: 0,
    maxMedia: 1,
    currentAnnot: 0,
    maxAnnot: 1
  },
  cash: {
    media: '',
    annots: [],
    annotIdx: 0,
    annotPage: 1,
    annotLast: 1,
    map: {},
    searchPage: 1,
    searchLast: 1
  },
  loop: false,
  get: function() { return this.data; },
  request: function(param) { return catalogueRequest(this, param); },
  reset: function(id) { return catalogueReset(this, id); },
  send: function() { return catalogueSend(this); }
};

function catalogueReset(cat, id) {
  return new Promise(function(resolve) {
    cat.data = [];
    cat.pages = {
      currentMedia: 0,
      maxMedia: 1,
      currentAnnot: 0,
      maxAnnot: 1
    };
    cat.cash = {
      media: id,
      annots: [],
      annotIdx: 0,
      annotPage: 1,
      annotLast: 1,
      map: {},
      searchPage: 1,
      searchLast: 1
    };
    cat.loop = false;

    resolve(cat);
  }).catch(err => {
    console.log('catalogueReset:', err);
  });
}

function catalogueRequest(cat, p) {
  console.time('catalogueRequest');
  return new Promise(function(resolve) {
    // querySearch with one annotation
    var action;
    // if no media
    if (p.media === '') {
      console.log('no media');
      action = cat.reset('')
      .then(cat => {
        // empty response
        return Promise.resolve({_embedded: {media: []}});
      });
    } else if (p.media === cat.cash.media) { // same media
      // console.log('same media');
      // screen annotIdx
      if (cat.cash.annotIdx < cat.cash.annots.length) {
        // next annot in cashed list
        action = catalogueRequestAnnot(cat.cash.annotIdx, cat, p);
        // cat.cash.annotIdx++;
      } else { // finish current annot cashed list
        cat.cash.annotPage++;
        if (cat.cash.annotPage <= cat.cash.annotLast) {
          // query new annot list
          action = catalogueNewAnnotList(cat)
          .then(cat => catalogueRequestAnnot(cat.cash.annotIdx, cat, p));
          // cat.cash.annotIdx++;
          cat.loop = true;
        } else { // no more annot
          // return empty response
          action = Promise.resolve({_embedded: {media: []}});
          cat.loop = false;
        }
      }
    } else { // new media
      console.log('new media');
      action = cat.reset(p.media)
      .then(cat => catalogueGetRoot(cat))
      .then(cat => catalogueNewAnnotList(cat))
      .then(cat => catalogueRequestAnnot(cat.cash.annotIdx, cat, p));
      // cat.cash.annotIdx++;
      cat.loop = true;
    }
    resolve(action);
  }).then(res => {
    return catalogueAddMedia(cat, res);
  }).then(cat => {
    // add counters
    return Promise.resolve(cat.send());
  }).catch(err => {
    console.log('catalogueRequest:', err);
  });
}

var queryParams = {
  all: function(type) {
    var q = {
      bool: {must: [
        // {term:{key: "key"}},
        {term: {relationship: 'is'}}// ,
        // {term:{value: "value"}}
      ]}};
    var param = {
      db: 'default',
      q: JSON.stringify(q),
      term: 'api: * is *',
      page: 1,
      page_size: 1
    };
    if (type) {
      param.media_type = type;
      param.term += ` + type=${type}`;
    }
    return param;
  },
  annot: function(a, type, page) {
    var q = {
      bool: {must: [
        {term: {key: a.key}},
        {term: {relationship: a.relationship}},
        {term: {value: a.value}}
      ]}};
    var param = {
      db: 'default',
      q: JSON.stringify(q),
      term: `api: ${a.key}, ${a.relationship}, ${a.value}`,
      page: page
    };
    if (type) {
      param.media_type = type;
      param.term += ` + type=${type}`;
    }
    return param;
  }
};

function catalogueNewAnnotList(cat) {
  // console.time('catalogueNewAnnotList');
  var param = {media: cat.cash.media, page: cat.cash.annotPage};
  return queryAnnot(param)
  .then(res => {
    cat.cash.annots = res._embedded.annotation;
    cat.cash.annotIdx = 0;
    // cat.cash.annotPage++;
    cat.cash.annotLast = res.page_count;
    cat.pages.maxAnnot = res.total_items;
    // console.log('new annot list:', cat.cash.annotPage);
    // console.timeEnd('catalogueNewAnnotList');
    return Promise.resolve(cat);
  }).catch(err => {
    return Error(`catalogueNewAnnotList: ${err}`);
  });
}

function catalogueRequestAnnot(idx, cat, p) {
  // console.time('catalogueRequestAnnot');
  // console.log('request annot', idx);
  var a = cat.cash.annots[idx];
  var action;
  if (p.media_type) {
    action = querySearch(queryParams.annot(a, p.media_type, cat.pages.searchPage));
  } else { // query all types
    var queue = [];
    collections.nodes.forEach(f => {
      queue.push(querySearch(queryParams.annot(a, f.name, cat.pages.searchPage)));
    });
    action = Promise.all(queue)
    .then(list => {
      // concat results
      var res = [];
      var total = 0;
      list.forEach(f => {
        res = res.concat(f._embedded.media);
        if (f.total_items > total) {
          total = f.total_items;
        }
      });
      return Promise.resolve({_embedded: {media: res}, total_items: total});
    });
  }
  cat.pages.currentAnnot++;
  cat.cash.annotIdx++;
  // console.log('add annot', cat.pages.currentAnnot);
  // console.timeEnd('catalogueRequestAnnot');
  return action;
}

function catalogueAddMedia(cat, res) {
  // console.time('catalogueAddMedia');
  // console.log('addMedia');
  return new Promise(resolve => {
    // max media
    if (res.total_items > cat.pages.maxMedia) {
      cat.pages.maxMedia = res.total_items;
    }
    var id = '';
    // aggregate
    res._embedded.media.forEach(d => {
      id = d.id.toString();
      // if media not exist
      if (cat.cash.map[id] === undefined) {
        cat.cash.map[id] = cat.data.length;
        cat.data.push({
          media: {
            id: id,
            title: d.title,
            type: d.media_type,
            autoAnnots: d.auto_annotation_count,
            userAnnots: d.user_annotation_count
          },
          occur: 0
        });
      }
      // occur +1
      cat.data[cat.cash.map[id]].occur++;
    });
    // force root occur
    // if (id !== '') { // in case of empty media, id is empty
    //  cat.data[0].occur++;
    // }
    // console.log('root occur', cat.data[0].occur);

    // console.log('AddMedia: cat.data', cat.data);
    // console.timeEnd('catalogueAddMedia');
    resolve(cat);
  }).catch(err => {
    return Error(`catalogueAddMedia: ${err}`);
  });
}

function catalogueGetRoot(cat) {
  // console.time('catalogueGetRoot');
  return queryMedia(cat.cash.media)
  .then(res => {
    var id = res.id.toString();
    cat.cash.map[id] = cat.data.length;
    cat.data.push({
      media: {
        id: id,
        title: res.title,
        type: res.media_type,
        autoAnnots: res.auto_annotation_count,
        userAnnots: res.user_annotation_count
      },
      occur: 0
    });
    // console.log('reset + root', cat.data);
    // console.log(res.bou.err);
    // console.timeEnd('catalogueGetRoot');
    return Promise.resolve(cat);
  }).catch(err => {
    return Error(`catalogueGetRoot: ${err}`);
  });
}

function catalogueSend(cat) {
  // console.time('catalogueSend');
  return new Promise(function(resolve) {
    // count
    cat.pages.currentMedia = cat.data.length;

    var sorted = [];
    if (cat.data.length > 0) {
      // extract root
      var list = cat.data.slice(1);
      // sort by occurence
      sorted = list.sort((a, b) => {
        return b.occur - a.occur;
      });
      // add root on top
      sorted.unshift(cat.data[0]);
    }
    // else { // if no data - examples
    //  sorted = catalogue.mediaList;
    // }

    // console.log('out');
    var out = Object.assign(cat.pages, {cards: sorted, loop: cat.loop});
    // console.timeEnd('catalogueSend');
    resolve(out);
  }).catch(err => {
    return Error(`catalogueSend: ${err}`);
  });
}

function countRequest(count, p) {
  console.time('countRequest');
  var result = count.get();
  return Promise.resolve().then(() => {
    // query ick: count media by media_type
    // console.log(param.term);
    console.time('query');
    return querySearch(queryParams.all());
  }).then(res => {
    console.timeEnd('query');
    // result journal + extra count for each type
    // console.log('search result', res);
    var action;
    // verif get results
    if (res._embedded.media.length > 0) {
      // get media count by type
      action = countGetCount(res.extra.media_count)
      // get journal media
      .then(out => {
        result = out;
        return countSaveRoot(result.root, res._embedded.media[0]);
      })
      // for each type, query 1 media
      .then(root => {
        var queue = [];
        // console.log('out', result);
        result.nodes.forEach(f => {
          queue.push(
            querySearch(queryParams.all(f.name))
            .then(res => {
              var sub;
              if (res._embedded.media.length > 0) {
                sub = countSaveRoot(f, res._embedded.media[0]);
              } else {
                // console.log('oops', res);
                sub = Promise.resolve(f);
              }
              return sub;
            })
          );
        });
        return Promise.all(queue);
      })
      // save file
      .then(out => {
        // console.log('after', result);
        return writeFile('./model/collections.json', result);
        // console.log(result.nodes);
      })
      // count data is new file
      .then(json => {
        count.data = json;
        count.update();
        return Promise.resolve(count.get());
      });
    } else {
      // get save files
      console.log('no results');
      action = Promise.resolve(count.get());
    }
    console.timeEnd('countRequest');
    return action;
  }).catch(err => {
    console.log('countRequest:', err);
  });
}

function countGetCount(mcount) {
  console.time('countGetCount');
  return new Promise(function(resolve) {
    var res = {
      root: {
        name: 'iCLiKVAL',
        count: mcount.total
      },
      nodes: []
    };

    Object.keys(mcount.media).forEach(k => {
      res.nodes.push({
        name: k,
        count: mcount.media[k]
      });
    });
    console.timeEnd('countGetCount');
    resolve(res);
  }).catch(err => {
    console.log(`countGetCount: ${err}`);
  });
}

function countSaveRoot(res, media) {
  console.time('countSaveRoot');
  return new Promise(function(resolve) {
    // console.log(media);
    res.top = {
      id: media.id,
      title: media.title,
      type: media.media_type,
      autoAnnots: media.auto_annotation_count,
      userAnnots: media.user_annotation_count
    };
    resolve(res);
  }).catch(err => {
    console.log(`countSaveRoot: ${err}`);
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

function countNodes(data) {
  return new Promise(function(resolve) {
    // console.log('res', res);
    // console.log('data', data);
    console.log('media_count', data.extra.media_count);
    var count = data.extra.media_count;
    var res = {
      root: {
        name: 'iCLiKVAL',
        count: count.total
      },
      nodes: []
    };

    Object.keys(count.media).forEach(k => {
      res.nodes.push({
        name: k,
        count: count.media[k]
      });
    });
    // count.updated();
    resolve(res);
  });
}

function writeFile(path, json) {
  console.time('writeFile');
  return new Promise(function(resolve, reject) {
    fs.writeFile(path, JSON.stringify(json), function(err) {
      console.timeEnd('writeFile');
      if (err) {
        reject(new Error(`Cannot write file ${path}: ${err}`));
      } else { resolve(json); }
    });
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
        console.log(`search: ${p.term} [${data.total_items}]`);
        // console.log(`params: ${p}`);
        // console.log(`res: ${body}`);
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

function queryMedia(id) {
  return new Promise(function(resolve, reject) {
    var options = {
      url: `http://api.iclikval.riken.jp/media/${id}`,
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
        resolve();
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
