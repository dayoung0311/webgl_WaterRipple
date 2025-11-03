/*
 * lightgl.js (Minimized for water ripple project)
 * https://github.com/evanw/lightgl.js/
 *
 * Copyright 2011 Evan Wallace
 * Released under the MIT license
 */

var GL = (function() {
  var gl;
  
  var GL = {
    create: function(options) {
      options = options || {};
      var canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 600;
      if (!('alpha' in options)) options.alpha = false;
      try { gl = canvas.getContext('webgl', options); } catch (e) {}
      try { gl = gl || canvas.getContext('experimental-webgl', options); } catch (e) {}
      if (!gl) throw new Error('WebGL not supported');
      gl.HALF_FLOAT_OES = 0x8D61;
      addMatrixStack();
      return gl;
    },
    Matrix: Matrix,
    Indexer: Indexer,
    Buffer: Buffer,
    Mesh: Mesh,
    Raytracer: Raytracer,
    Shader: Shader,
    Texture: Texture,
    Vector: Vector
  };
  
  // Matrix stack implementation
  function addMatrixStack() {
    gl.MODELVIEW = 0x12340001;
    gl.PROJECTION = 0x12340002;
    var tempMatrix = new Matrix();
    var resultMatrix = new Matrix();
    gl.modelviewMatrix = new Matrix();
    gl.projectionMatrix = new Matrix();
    var modelviewStack = [];
    var projectionStack = [];
    var matrix, stack;
    
    gl.matrixMode = function(mode) {
      switch (mode) {
        case gl.MODELVIEW:
          matrix = 'modelviewMatrix';
          stack = modelviewStack;
          break;
        case gl.PROJECTION:
          matrix = 'projectionMatrix';
          stack = projectionStack;
          break;
        default:
          throw new Error('invalid matrix mode ' + mode);
      }
    };
    gl.loadIdentity = function() {
      Matrix.identity(gl[matrix]);
    };
    gl.loadMatrix = function(m) {
      var from = m.m, to = gl[matrix].m;
      for (var i = 0; i < 16; i++) {
        to[i] = from[i];
      }
    };
    gl.multMatrix = function(m) {
      gl.loadMatrix(Matrix.multiply(gl[matrix], m, resultMatrix));
    };
    gl.perspective = function(fov, aspect, near, far) {
      gl.multMatrix(Matrix.perspective(fov, aspect, near, far, tempMatrix));
    };
    gl.scale = function(x, y, z) {
      gl.multMatrix(Matrix.scale(x, y, z, tempMatrix));
    };
    gl.translate = function(x, y, z) {
      gl.multMatrix(Matrix.translate(x, y, z, tempMatrix));
    };
    gl.rotate = function(a, x, y, z) {
      gl.multMatrix(Matrix.rotate(a, x, y, z, tempMatrix));
    };
    gl.pushMatrix = function() {
      stack.push(Array.prototype.slice.call(gl[matrix].m));
    };
    gl.popMatrix = function() {
      var m = stack.pop();
      gl[matrix].m = hasFloat32Array ? new Float32Array(m) : m;
    };
    gl.project = function(objX, objY, objZ, modelview, projection, viewport) {
      modelview = modelview || gl.modelviewMatrix;
      projection = projection || gl.projectionMatrix;
      viewport = viewport || gl.getParameter(gl.VIEWPORT);
      var point = projection.transformPoint(modelview.transformPoint(new Vector(objX, objY, objZ)));
      return new Vector(
        viewport[0] + viewport[2] * (point.x * 0.5 + 0.5),
        viewport[1] + viewport[3] * (point.y * 0.5 + 0.5),
        point.z * 0.5 + 0.5
      );
    };
    gl.unProject = function(winX, winY, winZ, modelview, projection, viewport) {
      modelview = modelview || gl.modelviewMatrix;
      projection = projection || gl.projectionMatrix;
      viewport = viewport || gl.getParameter(gl.VIEWPORT);
      var point = new Vector(
        (winX - viewport[0]) / viewport[2] * 2 - 1,
        (winY - viewport[1]) / viewport[3] * 2 - 1,
        winZ * 2 - 1
      );
      return Matrix.inverse(Matrix.multiply(projection, modelview, tempMatrix), resultMatrix).transformPoint(point);
    };
    gl.matrixMode(gl.MODELVIEW);
  }
  
  var hasFloat32Array = (typeof Float32Array != 'undefined');
  
  // Matrix class
  function Matrix() {
    var m = Array.prototype.concat.apply([], arguments);
    if (!m.length) {
      m = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1
      ];
    }
    this.m = hasFloat32Array ? new Float32Array(m) : m;
  }
  
  Matrix.prototype = {
    inverse: function() {
      return Matrix.inverse(this, new Matrix());
    },
    transpose: function() {
      return Matrix.transpose(this, new Matrix());
    },
    multiply: function(matrix) {
      return Matrix.multiply(this, matrix, new Matrix());
    },
    transformPoint: function(v) {
      var m = this.m;
      return new Vector(
        m[0] * v.x + m[1] * v.y + m[2] * v.z + m[3],
        m[4] * v.x + m[5] * v.y + m[6] * v.z + m[7],
        m[8] * v.x + m[9] * v.y + m[10] * v.z + m[11]
      ).divide(m[12] * v.x + m[13] * v.y + m[14] * v.z + m[15]);
    },
    transformVector: function(v) {
      var m = this.m;
      return new Vector(
        m[0] * v.x + m[1] * v.y + m[2] * v.z,
        m[4] * v.x + m[5] * v.y + m[6] * v.z,
        m[8] * v.x + m[9] * v.y + m[10] * v.z
      );
    }
  };
  
  Matrix.inverse = function(matrix, result) {
    result = result || new Matrix();
    var m = matrix.m, r = result.m;
  
    r[0] = m[5]*m[10]*m[15] - m[5]*m[14]*m[11] - m[6]*m[9]*m[15] + m[6]*m[13]*m[11] + m[7]*m[9]*m[14] - m[7]*m[13]*m[10];
    r[1] = -m[1]*m[10]*m[15] + m[1]*m[14]*m[11] + m[2]*m[9]*m[15] - m[2]*m[13]*m[11] - m[3]*m[9]*m[14] + m[3]*m[13]*m[10];
    r[2] = m[1]*m[6]*m[15] - m[1]*m[14]*m[7] - m[2]*m[5]*m[15] + m[2]*m[13]*m[7] + m[3]*m[5]*m[14] - m[3]*m[13]*m[6];
    r[3] = -m[1]*m[6]*m[11] + m[1]*m[10]*m[7] + m[2]*m[5]*m[11] - m[2]*m[9]*m[7] - m[3]*m[5]*m[10] + m[3]*m[9]*m[6];
  
    r[4] = -m[4]*m[10]*m[15] + m[4]*m[14]*m[11] + m[6]*m[8]*m[15] - m[6]*m[12]*m[11] - m[7]*m[8]*m[14] + m[7]*m[12]*m[10];
    r[5] = m[0]*m[10]*m[15] - m[0]*m[14]*m[11] - m[2]*m[8]*m[15] + m[2]*m[12]*m[11] + m[3]*m[8]*m[14] - m[3]*m[12]*m[10];
    r[6] = -m[0]*m[6]*m[15] + m[0]*m[14]*m[7] + m[2]*m[4]*m[15] - m[2]*m[12]*m[7] - m[3]*m[4]*m[14] + m[3]*m[12]*m[6];
    r[7] = m[0]*m[6]*m[11] - m[0]*m[10]*m[7] - m[2]*m[4]*m[11] + m[2]*m[8]*m[7] + m[3]*m[4]*m[10] - m[3]*m[8]*m[6];
  
    r[8] = m[4]*m[9]*m[15] - m[4]*m[13]*m[11] - m[5]*m[8]*m[15] + m[5]*m[12]*m[11] + m[7]*m[8]*m[13] - m[7]*m[12]*m[9];
    r[9] = -m[0]*m[9]*m[15] + m[0]*m[13]*m[11] + m[1]*m[8]*m[15] - m[1]*m[12]*m[11] - m[3]*m[8]*m[13] + m[3]*m[12]*m[9];
    r[10] = m[0]*m[5]*m[15] - m[0]*m[13]*m[7] - m[1]*m[4]*m[15] + m[1]*m[12]*m[7] + m[3]*m[4]*m[13] - m[3]*m[12]*m[5];
    r[11] = -m[0]*m[5]*m[11] + m[0]*m[9]*m[7] + m[1]*m[4]*m[11] - m[1]*m[8]*m[7] - m[3]*m[4]*m[9] + m[3]*m[8]*m[5];
  
    r[12] = -m[4]*m[9]*m[14] + m[4]*m[13]*m[10] + m[5]*m[8]*m[14] - m[5]*m[12]*m[10] - m[6]*m[8]*m[13] + m[6]*m[12]*m[9];
    r[13] = m[0]*m[9]*m[14] - m[0]*m[13]*m[10] - m[1]*m[8]*m[14] + m[1]*m[12]*m[10] + m[2]*m[8]*m[13] - m[2]*m[12]*m[9];
    r[14] = -m[0]*m[5]*m[14] + m[0]*m[13]*m[6] + m[1]*m[4]*m[14] - m[1]*m[12]*m[6] - m[2]*m[4]*m[13] + m[2]*m[12]*m[5];
    r[15] = m[0]*m[5]*m[10] - m[0]*m[9]*m[6] - m[1]*m[4]*m[10] + m[1]*m[8]*m[6] + m[2]*m[4]*m[9] - m[2]*m[8]*m[5];
  
    var det = m[0]*r[0] + m[1]*r[4] + m[2]*r[8] + m[3]*r[12];
    for (var i = 0; i < 16; i++) r[i] /= det;
    return result;
  };
  
  Matrix.transpose = function(matrix, result) {
    result = result || new Matrix();
    var m = matrix.m, r = result.m;
    r[0] = m[0]; r[1] = m[4]; r[2] = m[8]; r[3] = m[12];
    r[4] = m[1]; r[5] = m[5]; r[6] = m[9]; r[7] = m[13];
    r[8] = m[2]; r[9] = m[6]; r[10] = m[10]; r[11] = m[14];
    r[12] = m[3]; r[13] = m[7]; r[14] = m[11]; r[15] = m[15];
    return result;
  };
  
  Matrix.multiply = function(left, right, result) {
    result = result || new Matrix();
    var a = left.m, b = right.m, r = result.m;
  
    r[0] = a[0] * b[0] + a[1] * b[4] + a[2] * b[8] + a[3] * b[12];
    r[1] = a[0] * b[1] + a[1] * b[5] + a[2] * b[9] + a[3] * b[13];
    r[2] = a[0] * b[2] + a[1] * b[6] + a[2] * b[10] + a[3] * b[14];
    r[3] = a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3] * b[15];
  
    r[4] = a[4] * b[0] + a[5] * b[4] + a[6] * b[8] + a[7] * b[12];
    r[5] = a[4] * b[1] + a[5] * b[5] + a[6] * b[9] + a[7] * b[13];
    r[6] = a[4] * b[2] + a[5] * b[6] + a[6] * b[10] + a[7] * b[14];
    r[7] = a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7] * b[15];
  
    r[8] = a[8] * b[0] + a[9] * b[4] + a[10] * b[8] + a[11] * b[12];
    r[9] = a[8] * b[1] + a[9] * b[5] + a[10] * b[9] + a[11] * b[13];
    r[10] = a[8] * b[2] + a[9] * b[6] + a[10] * b[10] + a[11] * b[14];
    r[11] = a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11] * b[15];
  
    r[12] = a[12] * b[0] + a[13] * b[4] + a[14] * b[8] + a[15] * b[12];
    r[13] = a[12] * b[1] + a[13] * b[5] + a[14] * b[9] + a[15] * b[13];
    r[14] = a[12] * b[2] + a[13] * b[6] + a[14] * b[10] + a[15] * b[14];
    r[15] = a[12] * b[3] + a[13] * b[7] + a[14] * b[11] + a[15] * b[15];
  
    return result;
  };
  
  Matrix.identity = function(result) {
    result = result || new Matrix();
    var m = result.m;
    m[0] = m[5] = m[10] = m[15] = 1;
    m[1] = m[2] = m[3] = m[4] = m[6] = m[7] = m[8] = m[9] = m[11] = m[12] = m[13] = m[14] = 0;
    return result;
  };
  
  Matrix.perspective = function(fov, aspect, near, far, result) {
    var y = Math.tan(fov * Math.PI / 360) * near;
    var x = y * aspect;
    return Matrix.frustum(-x, x, -y, y, near, far, result);
  };
  
  Matrix.frustum = function(l, r, b, t, n, f, result) {
    result = result || new Matrix();
    var m = result.m;
  
    m[0] = 2 * n / (r - l);
    m[1] = 0;
    m[2] = (r + l) / (r - l);
    m[3] = 0;
  
    m[4] = 0;
    m[5] = 2 * n / (t - b);
    m[6] = (t + b) / (t - b);
    m[7] = 0;
  
    m[8] = 0;
    m[9] = 0;
    m[10] = -(f + n) / (f - n);
    m[11] = -2 * f * n / (f - n);
  
    m[12] = 0;
    m[13] = 0;
    m[14] = -1;
    m[15] = 0;
  
    return result;
  };
  
  Matrix.scale = function(x, y, z, result) {
    result = result || new Matrix();
    var m = result.m;
  
    m[0] = x;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
  
    m[4] = 0;
    m[5] = y;
    m[6] = 0;
    m[7] = 0;
  
    m[8] = 0;
    m[9] = 0;
    m[10] = z;
    m[11] = 0;
  
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
  
    return result;
  };
  
  Matrix.translate = function(x, y, z, result) {
    result = result || new Matrix();
    var m = result.m;
  
    m[0] = 1;
    m[1] = 0;
    m[2] = 0;
    m[3] = x;
  
    m[4] = 0;
    m[5] = 1;
    m[6] = 0;
    m[7] = y;
  
    m[8] = 0;
    m[9] = 0;
    m[10] = 1;
    m[11] = z;
  
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
  
    return result;
  };
  
  Matrix.rotate = function(a, x, y, z, result) {
    if (!a || (!x && !y && !z)) {
      return Matrix.identity(result);
    }
  
    result = result || new Matrix();
    var m = result.m;
  
    var d = Math.sqrt(x*x + y*y + z*z);
    a *= Math.PI / 180; x /= d; y /= d; z /= d;
    var c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  
    m[0] = x * x * t + c;
    m[1] = x * y * t - z * s;
    m[2] = x * z * t + y * s;
    m[3] = 0;
  
    m[4] = y * x * t + z * s;
    m[5] = y * y * t + c;
    m[6] = y * z * t - x * s;
    m[7] = 0;
  
    m[8] = z * x * t - y * s;
    m[9] = z * y * t + x * s;
    m[10] = z * z * t + c;
    m[11] = 0;
  
    m[12] = 0;
    m[13] = 0;
    m[14] = 0;
    m[15] = 1;
  
    return result;
  };
  
  // Indexer for mesh generation
  function Indexer() {
    this.unique = [];
    this.indices = [];
    this.map = {};
  }
  
  Indexer.prototype = {
    add: function(obj) {
      var key = JSON.stringify(obj);
      if (!(key in this.map)) {
        this.map[key] = this.unique.length;
        this.unique.push(obj);
      }
      return this.map[key];
    }
  };
  
  // Buffer class
  function Buffer(target, type) {
    this.buffer = null;
    this.target = target;
    this.type = type;
    this.data = [];
  }
  
  Buffer.prototype = {
    compile: function(type) {
      var data = [];
      for (var i = 0, chunk = 10000; i < this.data.length; i += chunk) {
        data = Array.prototype.concat.apply(data, this.data.slice(i, i + chunk));
      }
      var spacing = this.data.length ? data.length / this.data.length : 0;
      if (spacing != Math.round(spacing)) throw new Error('buffer elements not of consistent size, average size is ' + spacing);
      this.buffer = this.buffer || gl.createBuffer();
      this.buffer.length = data.length;
      this.buffer.spacing = spacing;
      gl.bindBuffer(this.target, this.buffer);
      gl.bufferData(this.target, new this.type(data), type || gl.STATIC_DRAW);
    }
  };
  
  // Mesh class
  function Mesh(options) {
    options = options || {};
    this.vertexBuffers = {};
    this.indexBuffers = {};
    this.addVertexBuffer('vertices', 'gl_Vertex');
    if (options.coords) this.addVertexBuffer('coords', 'gl_TexCoord');
    if (options.normals) this.addVertexBuffer('normals', 'gl_Normal');
    if (options.colors) this.addVertexBuffer('colors', 'gl_Color');
    if (!('triangles' in options) || options.triangles) this.addIndexBuffer('triangles');
    if (options.lines) this.addIndexBuffer('lines');
  }
  
  Mesh.prototype = {
    addVertexBuffer: function(name, attribute) {
      var buffer = this.vertexBuffers[attribute] = new Buffer(gl.ARRAY_BUFFER, Float32Array);
      buffer.name = name;
      this[name] = [];
    },
    addIndexBuffer: function(name) {
      var buffer = this.indexBuffers[name] = new Buffer(gl.ELEMENT_ARRAY_BUFFER, Uint16Array);
      this[name] = [];
    },
    compile: function() {
      for (var attribute in this.vertexBuffers) {
        var buffer = this.vertexBuffers[attribute];
        buffer.data = this[buffer.name];
        buffer.compile();
      }
      for (var name in this.indexBuffers) {
        var buffer = this.indexBuffers[name];
        buffer.data = this[name];
        buffer.compile();
      }
    }
  };
  
  Mesh.plane = function(options) {
    options = options || {};
    var mesh = new Mesh(options);
    detailX = options.detailX || options.detail || 1;
    detailY = options.detailY || options.detail || 1;
  
    for (var y = 0; y <= detailY; y++) {
      var t = y / detailY;
      for (var x = 0; x <= detailX; x++) {
        var s = x / detailX;
        mesh.vertices.push([2 * s - 1, 2 * t - 1, 0]);
        if (mesh.coords) mesh.coords.push([s, t]);
        if (mesh.normals) mesh.normals.push([0, 0, 1]);
        if (x < detailX && y < detailY) {
          var i = x + y * (detailX + 1);
          mesh.triangles.push([i, i + 1, i + detailX + 1]);
          mesh.triangles.push([i + detailX + 1, i + 1, i + detailX + 2]);
        }
      }
    }
  
    mesh.compile();
    return mesh;
  };
  
  var cubeData = [
    [0, 4, 2, 6, -1, 0, 0], // -x
    [1, 3, 5, 7, +1, 0, 0], // +x
    [0, 1, 4, 5, 0, -1, 0], // -y
    [2, 6, 3, 7, 0, +1, 0], // +y
    [0, 2, 1, 3, 0, 0, -1], // -z
    [4, 5, 6, 7, 0, 0, +1]  // +z
  ];
  
  function pickOctant(i) {
    return new Vector((i & 1) * 2 - 1, (i & 2) - 1, (i & 4) / 2 - 1);
  }
  
  Mesh.cube = function(options) {
    var mesh = new Mesh(options);
  
    for (var i = 0; i < cubeData.length; i++) {
      var data = cubeData[i], v = i * 4;
      for (var j = 0; j < 4; j++) {
        var d = data[j];
        mesh.vertices.push(pickOctant(d).toArray());
        if (mesh.coords) mesh.coords.push([j & 1, (j & 2) / 2]);
        if (mesh.normals) mesh.normals.push(data.slice(4, 7));
      }
      mesh.triangles.push([v, v + 1, v + 2]);
      mesh.triangles.push([v + 2, v + 1, v + 3]);
    }
  
    mesh.compile();
    return mesh;
  };
  
  Mesh.sphere = function(options) {
    function tri(a, b, c) { return flip ? [a, c, b] : [a, b, c]; }
    function fix(x) { return x + (x - x * x) / 2; }
    options = options || {};
    var mesh = new Mesh(options);
    var indexer = new Indexer();
    detail = options.detail || 6;
  
    for (var octant = 0; octant < 8; octant++) {
      var scale = pickOctant(octant);
      var flip = scale.x * scale.y * scale.z > 0;
      var data = [];
      for (var i = 0; i <= detail; i++) {
        for (var j = 0; i + j <= detail; j++) {
          var a = i / detail;
          var b = j / detail;
          var c = (detail - i - j) / detail;
          var vertex = { vertex: new Vector(fix(a), fix(b), fix(c)).unit().multiply(scale).toArray() };
          if (mesh.coords) vertex.coord = scale.y > 0 ? [1 - a, c] : [c, 1 - a];
          data.push(indexer.add(vertex));
        }
  
        if (i > 0) {
          for (var j = 0; i + j <= detail; j++) {
            var a = (i - 1) * (detail + 1) + ((i - 1) - (i - 1) * (i - 1)) / 2 + j;
            var b = i * (detail + 1) + (i - i * i) / 2 + j;
            mesh.triangles.push(tri(data[a], data[a + 1], data[b]));
            if (i + j < detail) {
              mesh.triangles.push(tri(data[b], data[a + 1], data[b + 1]));
            }
          }
        }
      }
    }
  
    mesh.vertices = indexer.unique.map(function(v) { return v.vertex; });
    if (mesh.coords) mesh.coords = indexer.unique.map(function(v) { return v.coord; });
    if (mesh.normals) mesh.normals = mesh.vertices;
    mesh.compile();
    return mesh;
  };
  
  // Raytracer
  function Raytracer() {
    var v = gl.getParameter(gl.VIEWPORT);
    var m = gl.modelviewMatrix.m;
  
    var axisX = new Vector(m[0], m[4], m[8]);
    var axisY = new Vector(m[1], m[5], m[9]);
    var axisZ = new Vector(m[2], m[6], m[10]);
    var offset = new Vector(m[3], m[7], m[11]);
    this.eye = new Vector(-offset.dot(axisX), -offset.dot(axisY), -offset.dot(axisZ));
  
    var minX = v[0], maxX = minX + v[2];
    var minY = v[1], maxY = minY + v[3];
    this.ray00 = gl.unProject(minX, minY, 1).subtract(this.eye);
    this.ray10 = gl.unProject(maxX, minY, 1).subtract(this.eye);
    this.ray01 = gl.unProject(minX, maxY, 1).subtract(this.eye);
    this.ray11 = gl.unProject(maxX, maxY, 1).subtract(this.eye);
    this.viewport = v;
  }
  
  Raytracer.prototype = {
    getRayForPixel: function(x, y) {
      x = (x - this.viewport[0]) / this.viewport[2];
      y = 1 - (y - this.viewport[1]) / this.viewport[3];
      var ray0 = Vector.lerp(this.ray00, this.ray10, x);
      var ray1 = Vector.lerp(this.ray01, this.ray11, x);
      return Vector.lerp(ray0, ray1, y).unit();
    }
  };
  
  // Shader
  function regexMap(regex, text, callback) {
    while ((result = regex.exec(text)) != null) {
      callback(result);
    }
  }
  
  var LIGHTGL_PREFIX = 'LIGHTGL';
  
  function Shader(vertexSource, fragmentSource) {
    function followScriptTagById(id) {
      var element = document.getElementById(id);
      return element ? element.text : id;
    }
    vertexSource = followScriptTagById(vertexSource);
    fragmentSource = followScriptTagById(fragmentSource);
  
    var header = '\
      uniform mat3 gl_NormalMatrix;\
      uniform mat4 gl_ModelViewMatrix;\
      uniform mat4 gl_ProjectionMatrix;\
      uniform mat4 gl_ModelViewProjectionMatrix;\
      uniform mat4 gl_ModelViewMatrixInverse;\
      uniform mat4 gl_ProjectionMatrixInverse;\
      uniform mat4 gl_ModelViewProjectionMatrixInverse;\
    ';
    var vertexHeader = header + '\
      attribute vec4 gl_Vertex;\
      attribute vec4 gl_TexCoord;\
      attribute vec3 gl_Normal;\
      attribute vec4 gl_Color;\
      vec4 ftransform() {\
        return gl_ModelViewProjectionMatrix * gl_Vertex;\
      }\
    ';
    var fragmentHeader = '\
      precision highp float;\
    ' + header;
  
    var source = vertexSource + fragmentSource;
    var usedMatrices = {};
    regexMap(/\b(gl_[^;]*)\b;/g, header, function(groups) {
      var name = groups[1];
      if (source.indexOf(name) != -1) {
        var capitalLetters = name.replace(/[a-z_]/g, '');
        usedMatrices[capitalLetters] = LIGHTGL_PREFIX + name;
      }
    });
    if (source.indexOf('ftransform') != -1) usedMatrices.MVPM = LIGHTGL_PREFIX + 'gl_ModelViewProjectionMatrix';
    this.usedMatrices = usedMatrices;
  
    function fix(header, source) {
      var replaced = {};
      var match = /^((\s*\/\/.*\n|\s*#extension.*\n)+)[^]*$/.exec(source);
      source = match ? match[1] + header + source.substr(match[1].length) : header + source;
      regexMap(/\bgl_\w+\b/g, header, function(result) {
        if (!(result in replaced)) {
          source = source.replace(new RegExp('\\b' + result + '\\b', 'g'), LIGHTGL_PREFIX + result);
          replaced[result] = true;
        }
      });
      return source;
    }
    vertexSource = fix(vertexHeader, vertexSource);
    fragmentSource = fix(fragmentHeader, fragmentSource);
  
    function compileSource(type, source) {
      var shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error('compile error: ' + gl.getShaderInfoLog(shader));
      }
      return shader;
    }
    this.program = gl.createProgram();
    gl.attachShader(this.program, compileSource(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(this.program, compileSource(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error('link error: ' + gl.getProgramInfoLog(this.program));
    }
    this.attributes = {};
    this.uniformLocations = {};
  
    var isSampler = {};
    regexMap(/uniform\s+sampler(1D|2D|3D|Cube)\s+(\w+)\s*;/g, vertexSource + fragmentSource, function(groups) {
      isSampler[groups[2]] = 1;
    });
    this.isSampler = isSampler;
  }
  
  function isArray(obj) {
    var str = Object.prototype.toString.call(obj);
    return str == '[object Array]' || str == '[object Float32Array]';
  }
  
  function isNumber(obj) {
    var str = Object.prototype.toString.call(obj);
    return str == '[object Number]' || str == '[object Boolean]';
  }
  
  var tempMatrix = new Matrix();
  var resultMatrix = new Matrix();
  
  Shader.prototype = {
    uniforms: function(uniforms) {
      gl.useProgram(this.program);
  
      for (var name in uniforms) {
        var location = this.uniformLocations[name] || gl.getUniformLocation(this.program, name);
        if (!location) continue;
        this.uniformLocations[name] = location;
        var value = uniforms[name];
        if (value instanceof Vector) {
          value = [value.x, value.y, value.z];
        } else if (value instanceof Matrix) {
          value = value.m;
        }
        if (isArray(value)) {
          switch (value.length) {
            case 1: gl.uniform1fv(location, new Float32Array(value)); break;
            case 2: gl.uniform2fv(location, new Float32Array(value)); break;
            case 3: gl.uniform3fv(location, new Float32Array(value)); break;
            case 4: gl.uniform4fv(location, new Float32Array(value)); break;
            case 9: gl.uniformMatrix3fv(location, false, new Float32Array([
              value[0], value[3], value[6],
              value[1], value[4], value[7],
              value[2], value[5], value[8]
            ])); break;
            case 16: gl.uniformMatrix4fv(location, false, new Float32Array([
              value[0], value[4], value[8], value[12],
              value[1], value[5], value[9], value[13],
              value[2], value[6], value[10], value[14],
              value[3], value[7], value[11], value[15]
            ])); break;
            default: throw new Error('don\'t know how to load uniform "' + name + '" of length ' + value.length);
          }
        } else if (isNumber(value)) {
          (this.isSampler[name] ? gl.uniform1i : gl.uniform1f).call(gl, location, value);
        } else {
          throw new Error('attempted to set uniform "' + name + '" to invalid value ' + value);
        }
      }
  
      return this;
    },
    draw: function(mesh, mode) {
      this.drawBuffers(mesh.vertexBuffers,
        mesh.indexBuffers[mode == gl.LINES ? 'lines' : 'triangles'],
        arguments.length < 2 ? gl.TRIANGLES : mode);
    },
    drawBuffers: function(vertexBuffers, indexBuffer, mode) {
      var used = this.usedMatrices;
      var MVM = gl.modelviewMatrix;
      var PM = gl.projectionMatrix;
      var MVMI = (used.MVMI || used.NM) ? MVM.inverse() : null;
      var PMI = (used.PMI) ? PM.inverse() : null;
      var MVPM = (used.MVPM || used.MVPMI) ? PM.multiply(MVM) : null;
      var matrices = {};
      if (used.MVM) matrices[used.MVM] = MVM;
      if (used.MVMI) matrices[used.MVMI] = MVMI;
      if (used.PM) matrices[used.PM] = PM;
      if (used.PMI) matrices[used.PMI] = PMI;
      if (used.MVPM) matrices[used.MVPM] = MVPM;
      if (used.MVPMI) matrices[used.MVPMI] = MVPM.inverse();
      if (used.NM) {
        var m = MVMI.m;
        matrices[used.NM] = [m[0], m[4], m[8], m[1], m[5], m[9], m[2], m[6], m[10]];
      }
      this.uniforms(matrices);
  
      var length = 0;
      for (var attribute in vertexBuffers) {
        var buffer = vertexBuffers[attribute];
        var location = this.attributes[attribute] ||
          gl.getAttribLocation(this.program, attribute.replace(/^(gl_.*)$/, LIGHTGL_PREFIX + '$1'));
        if (location == -1 || !buffer.buffer) continue;
        this.attributes[attribute] = location;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer.buffer);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, buffer.buffer.spacing, gl.FLOAT, false, 0, 0);
        length = buffer.buffer.length / buffer.buffer.spacing;
      }
  
      for (var attribute in this.attributes) {
        if (!(attribute in vertexBuffers)) {
          gl.disableVertexAttribArray(this.attributes[attribute]);
        }
      }
  
      if (length && (!indexBuffer || indexBuffer.buffer)) {
        if (indexBuffer) {
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer.buffer);
          gl.drawElements(mode, indexBuffer.buffer.length, gl.UNSIGNED_SHORT, 0);
        } else {
          gl.drawArrays(mode, 0, length);
        }
      }
  
      return this;
    }
  };
  
  // Texture
  function Texture(width, height, options) {
    options = options || {};
    this.id = gl.createTexture();
    this.width = width;
    this.height = height;
    this.format = options.format || gl.RGBA;
    this.type = options.type || gl.UNSIGNED_BYTE;
    var magFilter = options.filter || options.magFilter || gl.LINEAR;
    var minFilter = options.filter || options.minFilter || gl.LINEAR;
    if (this.type === gl.FLOAT) {
      if (!Texture.canUseFloatingPointTextures()) {
        throw new Error('OES_texture_float is required but not supported');
      }
      if ((minFilter !== gl.NEAREST || magFilter !== gl.NEAREST) &&
          !Texture.canUseFloatingPointLinearFiltering()) {
        throw new Error('OES_texture_float_linear is required but not supported');
      }
    } else if (this.type === gl.HALF_FLOAT_OES) {
      if (!Texture.canUseHalfFloatingPointTextures()) {
        throw new Error('OES_texture_half_float is required but not supported');
      }
      if ((minFilter !== gl.NEAREST || magFilter !== gl.NEAREST) &&
          !Texture.canUseHalfFloatingPointLinearFiltering()) {
        throw new Error('OES_texture_half_float_linear is required but not supported');
      }
    }
    gl.bindTexture(gl.TEXTURE_2D, this.id);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, options.wrap || options.wrapS || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, options.wrap || options.wrapT || gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.format, width, height, 0, this.format, this.type, null);
  }
  
  var framebuffer;
  var renderbuffer;
  
  Texture.prototype = {
    bind: function(unit) {
      gl.activeTexture(gl.TEXTURE0 + (unit || 0));
      gl.bindTexture(gl.TEXTURE_2D, this.id);
    },
    unbind: function(unit) {
      gl.activeTexture(gl.TEXTURE0 + (unit || 0));
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    canDrawTo: function() {
      framebuffer = framebuffer || gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.id, 0);
      var result = gl.checkFramebufferStatus(gl.FRAMEBUFFER) == gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return result;
    },
    drawTo: function(callback) {
      var v = gl.getParameter(gl.VIEWPORT);
      framebuffer = framebuffer || gl.createFramebuffer();
      renderbuffer = renderbuffer || gl.createRenderbuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.bindRenderbuffer(gl.RENDERBUFFER, renderbuffer);
      if (this.width != renderbuffer.width || this.height != renderbuffer.height) {
        renderbuffer.width = this.width;
        renderbuffer.height = this.height;
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.width, this.height);
      }
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.id, 0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, renderbuffer);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
        throw new Error('Rendering to this texture is not supported (incomplete framebuffer)');
      }
      gl.viewport(0, 0, this.width, this.height);
  
      callback();
  
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindRenderbuffer(gl.RENDERBUFFER, null);
      gl.viewport(v[0], v[1], v[2], v[3]);
    },
    swapWith: function(other) {
      var temp;
      temp = other.id; other.id = this.id; this.id = temp;
      temp = other.width; other.width = this.width; this.width = temp;
      temp = other.height; other.height = this.height; this.height = temp;
    }
  };
  
  Texture.fromImage = function(image, options) {
    options = options || {};
    var texture = new Texture(image.width, image.height, options);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, texture.format, texture.format, texture.type, image);
    } catch (e) {
      if (location.protocol == 'file:') {
        throw new Error('image not loaded for security reasons (serve this page over "http://" instead)');
      } else {
        throw new Error('image not loaded for security reasons (image must originate from the same ' +
          'domain as this page or use Cross-Origin Resource Sharing)');
      }
    }
    if (options.minFilter && options.minFilter != gl.NEAREST && options.minFilter != gl.LINEAR) {
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    return texture;
  };
  
  Texture.canUseFloatingPointTextures = function() {
    return !!gl.getExtension('OES_texture_float');
  };
  
  Texture.canUseFloatingPointLinearFiltering = function() {
    return !!gl.getExtension('OES_texture_float_linear');
  };
  
  Texture.canUseHalfFloatingPointTextures = function() {
    return !!gl.getExtension('OES_texture_half_float');
  };
  
  Texture.canUseHalfFloatingPointLinearFiltering = function() {
    return !!gl.getExtension('OES_texture_half_float_linear');
  };
  
  // Vector
  function Vector(x, y, z) {
    this.x = x || 0;
    this.y = y || 0;
    this.z = z || 0;
  }
  
  Vector.prototype = {
    negative: function() {
      return new Vector(-this.x, -this.y, -this.z);
    },
    add: function(v) {
      if (v instanceof Vector) return new Vector(this.x + v.x, this.y + v.y, this.z + v.z);
      else return new Vector(this.x + v, this.y + v, this.z + v);
    },
    subtract: function(v) {
      if (v instanceof Vector) return new Vector(this.x - v.x, this.y - v.y, this.z - v.z);
      else return new Vector(this.x - v, this.y - v, this.z - v);
    },
    multiply: function(v) {
      if (v instanceof Vector) return new Vector(this.x * v.x, this.y * v.y, this.z * v.z);
      else return new Vector(this.x * v, this.y * v, this.z * v);
    },
    divide: function(v) {
      if (v instanceof Vector) return new Vector(this.x / v.x, this.y / v.y, this.z / v.z);
      else return new Vector(this.x / v, this.y / v, this.z / v);
    },
    dot: function(v) {
      return this.x * v.x + this.y * v.y + this.z * v.z;
    },
    cross: function(v) {
      return new Vector(
        this.y * v.z - this.z * v.y,
        this.z * v.x - this.x * v.z,
        this.x * v.y - this.y * v.x
      );
    },
    length: function() {
      return Math.sqrt(this.dot(this));
    },
    unit: function() {
      return this.divide(this.length());
    },
    toArray: function(n) {
      return [this.x, this.y, this.z].slice(0, n || 3);
    }
  };
  
  Vector.lerp = function(a, b, fraction) {
    return b.subtract(a).multiply(fraction).add(a);
  };
  
  return GL;
})();
