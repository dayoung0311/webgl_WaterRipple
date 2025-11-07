// ============================================================================
// WebGL Water — photoreal droplet (3D mesh + water shading)
// ============================================================================

var gl = GL.create({ alpha: false });
// 감정 색상 정의 (RGB)
const EMOTION_COLORS = {
  JOY:      [1.0, 0.9, 0.2],   // 노란색
  SAD:      [0.2, 0.4, 1.0],   // 파란색
  ANGRY:    [1.0, 0.2, 0.2],   // 빨강색
  ANXIETY:  [0.6, 0.2, 1.0],   // 보라색
  CALM:     [0.2, 0.8, 0.4]    // 초록색
};

var gTime = 0.0;
const TEXEL = 1.0 / 512.0;
const MIN_R = 3.0 * TEXEL;

// Impact profile (timing/amplitudes)
const IMPACT = {
  SLOW: 2.2,
  crownR: 0.050, crownW: 0.018, crownAmp: 0.038,
  cavityAmp: 0.045,
  jetR0:   0.0028, jetRmin: 0.0006, jetAmp0: 0.030, jetAmp1: 0.075,
  neckNearR: 0.0036, neckNearW: 0.0010, neckNearA: -0.70,
  neckCoreR: 0.0028, neckCoreW: 0.0010, neckCoreA: -0.60,
  tipAttachDur: 0.16, tipRadius: 0.0075, tipFreeRad: 0.0056, tipLift: 0.19
};

// --- helpers
function addDropSoft(water, x, z, r, strength){
  let rr = Math.max(r, MIN_R);
  let sAdj = strength * (r*r) / (rr*rr);
  water.addDrop(x, z, rr, sAdj);
}
function addRingDoGSoft(water, x, z, r, width, amp){
  let rr = Math.max(r, MIN_R);
  let ww = Math.max(width, 2.0*TEXEL);
  addDropSoft(water, x, z, rr,              +amp);
  addDropSoft(water, x, z, Math.max(rr-0.5*ww, MIN_R), -amp*0.6);
  addDropSoft(water, x, z, rr+0.5*ww,                   -amp*0.6);
}

// ----------------------------------------------------------------------------
// Cubemap
// ----------------------------------------------------------------------------
function Cubemap(images) {
  this.id = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, this.id);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.xneg);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.xpos);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.yneg);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.ypos);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.zneg);
  gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, images.zpos);
}
Cubemap.prototype.bind   = function(u){ gl.activeTexture(gl.TEXTURE0+(u||0)); gl.bindTexture(gl.TEXTURE_CUBE_MAP,this.id); };
Cubemap.prototype.unbind = function(u){ gl.activeTexture(gl.TEXTURE0+(u||0)); gl.bindTexture(gl.TEXTURE_CUBE_MAP,null); };

// ----------------------------------------------------------------------------
// Water simulation (float ping-pong textures)
// ----------------------------------------------------------------------------
function Water() {
  this.plane = GL.Mesh.plane();
  if (!GL.Texture.canUseFloatingPointTextures()) throw new Error('float textures required');
  var filter = GL.Texture.canUseFloatingPointLinearFiltering()? gl.LINEAR: gl.NEAREST;
  this.textureA = new GL.Texture(512,512,{type:gl.FLOAT, filter});
  this.textureB = new GL.Texture(512,512,{type:gl.FLOAT, filter});

  if((!this.textureA.canDrawTo() || !this.textureB.canDrawTo()) && GL.Texture.canUseHalfFloatingPointTextures()){
    filter = GL.Texture.canUseFloatingPointLinearFiltering()? gl.LINEAR: gl.NEAREST;
    this.textureA = new GL.Texture(512,512,{type:gl.HALF_FLOAT_OES, filter});
    this.textureB = new GL.Texture(512,512,{type:gl.HALF_FLOAT_OES, filter});
  }
  this.normalTexture = new GL.Texture(512, 512, { type: gl.FLOAT });
  this.causticTex = new GL.Texture(512, 512, { type: gl.FLOAT });
  this.colorTexture = new GL.Texture(512, 512, { type: gl.FLOAT });
  // ✅ 추가: 색상 확산용 텍스처
  this.colorTextureA = new GL.Texture(512, 512, { type: gl.FLOAT });
  this.colorTextureB = new GL.Texture(512, 512, { type: gl.FLOAT });
  this.dropShader   = new GL.Shader('water-vertex','water-drop-fragment');
  this.updateShader = new GL.Shader('water-vertex','water-update-fragment');
  this.normalShader = new GL.Shader('water-vertex','water-normal-fragment');
  this.colorShader = new GL.Shader('water-vertex', 'water-color-fragment');

}
Water.prototype.addDrop = function(x,y,r,str){
  var self=this;
  this.textureB.drawTo(function(){
    self.textureA.bind();
    self.dropShader.uniforms({center:[x,y], radius:r, strength:str}).draw(self.plane);
  });
  this.textureB.swapWith(this.textureA);
};
Water.prototype.stepSimulation = function(){
  var self=this;
  this.textureB.drawTo(function(){
    self.textureA.bind();
    self.updateShader.uniforms({delta:[1/self.textureA.width,1/self.textureA.height]}).draw(self.plane);
  });
  this.textureB.swapWith(this.textureA);
};
Water.prototype.updateNormals = function(){
  var self=this;
  this.textureB.drawTo(function(){
    self.textureA.bind();
    self.normalShader.uniforms({delta:[1/self.textureA.width,1/self.textureA.height]}).draw(self.plane);
  });
  this.textureB.swapWith(this.textureA);
};
Water.prototype.addColor = function(x, z, color, radius) {
  const self = this;
  this.colorTextureB.drawTo(function() {
    self.colorTextureA.bind(0); // 읽기 전용
    self.colorShader.uniforms({
      texture: 0,
      center: [x * 0.5 + 0.5, z * 0.5 + 0.5],
      color: color,
      radius: radius,
      time: gTime || 0.0
    }).draw(self.plane);
  });
  this.colorTextureB.swapWith(this.colorTextureA);
};
Water.prototype.updateColorTexture = function() {
  const self = this;
  this.colorTextureB.drawTo(function() {
    self.colorTextureA.bind(0);
    self.colorShader.uniforms({
      texture: 0,
      center: [-1.0, -1.0],
      color: [0.0, 0.0, 0.0],
      radius: 0.0001, decay: 0.99,
      time: gTime || 0.0
    }).draw(self.plane);
  });
  this.colorTextureB.swapWith(this.colorTextureA);
};


// ----------------------------------------------------------------------------
// Crown splash (impact)
function addCrownSplash(water, cx, cz, amp){
  const a = amp || 0.06;
  const rimR = 12*TEXEL, rimW = 7*TEXEL;

  addDropSoft(water, cx, cz, rimR, +a);
  addDropSoft(water, cx, cz, rimR-0.5*rimW, -a*0.4);
  addDropSoft(water, cx, cz, rimR+0.5*rimW, -a*0.4);

  const lobes = 12, jiggle = 0.25;
  const rLobe = Math.max(rimR * 0.95, 3.0*TEXEL);
  for (let i=0;i<lobes;i++){
    let th = (i/lobes)*Math.PI*2.0;
    let jitter = 1.0 + jiggle*Math.sin(th*3.0);
    let x = cx + Math.cos(th)*rLobe*jitter;
    let z = cz + Math.sin(th)*rLobe*jitter;
    addDropSoft(water, x, z, 2.8*TEXEL, +a*0.55);
  }
  addDropSoft(water, cx, cz, 0.018, -a*0.8);
  addRingDoGSoft(water, cx, cz, 0.045, 0.020, -a*0.22);
}

// ----------------------------------------------------------------------------
// Renderer
// ----------------------------------------------------------------------------
function Renderer() {
  this.tileTexture = GL.Texture.fromImage(document.getElementById('tiles'), {
    minFilter: gl.LINEAR_MIPMAP_LINEAR, wrap: gl.REPEAT, format: gl.RGB
  });

  this.lightDir  = new GL.Vector(-0.001,-1.0,-0.001).unit();
  this.waterMesh = GL.Mesh.plane({detail:200});

  var helper = document.getElementById('helper-functions').text;
  this.waterShaders = [
    new GL.Shader('water-surface-vertex',
        helper + '\n' + document.getElementById('water-surface-abovewater-fragment').text),
    new GL.Shader('water-surface-vertex',
        helper + '\n' + document.getElementById('water-surface-underwater-fragment').text)
  ];

  // ✅ sky 큐브맵을 두 water shader에 전달
  this.waterShaders[0].uniforms.sky = this.cubemap;
  this.waterShaders[1].uniforms.sky = this.cubemap;

  this.cubeMesh = GL.Mesh.cube();
  this.cubeMesh.triangles.splice(4,2);
  this.cubeMesh.compile();
  this.cubeShader = new GL.Shader(helper+'\n'+document.getElementById('cube-vertex').text,
      helper+'\n'+document.getElementById('cube-fragment').text);

  var hasDeriv = !!gl.getExtension('OES_standard_derivatives');
  var cfragId  = hasDeriv ? 'caustics-fragment-derivatives' : 'caustics-fragment';
  this.causticsShader = new GL.Shader(helper+'\n'+document.getElementById('caustics-vertex').text,
      helper+'\n'+document.getElementById(cfragId).text);
  this.causticTex = new GL.Texture(1024,1024);
  this.sphereCenter = new GL.Vector();
  this.sphereRadius = 0.0;

  // --- droplet meshes ---
  this.dropletMeshSpout = GL.Mesh.sphere({detail:22, normals:true});
  for (var i=0;i<this.dropletMeshSpout.vertices.length;i++){
    var v=this.dropletMeshSpout.vertices[i];
    var x=v[0], y=v[1], z=v[2];

    // vertical shaping (top skinny, bottom slightly squashed)
    if (y > 0.0) y = Math.pow(y, 1.85) * 1.65; else y *= 0.58;

    // horizontal shaping (bottom bulge, top pinch)
    var up = Math.max(0, Math.min(1, (y+1.0)*0.5));
    var s  = (1.0 + 0.45*(1.0-up)) * (1.0 - 0.55*up);
    x *= s; z *= s;

    this.dropletMeshSpout.vertices[i]=[x,y,z];
    this.dropletMeshSpout.normals[i]=[x,y,z];
  }
  this.dropletMeshSpout.compile();

  // round tip droplet
  this.dropletMeshRound = GL.Mesh.sphere({detail:24, normals:true});
  this.dropletMeshRound.compile();

  // water-like material for round tip
  this.waterMaterialShader = new GL.Shader(
      'varying vec3 vN; varying vec3 vE; void main(){ vN=normalize(gl_NormalMatrix*gl_Normal); vec4 ep=gl_ModelViewMatrix*gl_Vertex; vE=ep.xyz; gl_Position=gl_ModelViewProjectionMatrix*gl_Vertex; }',
      [
        'precision highp float;',
        'varying vec3 vN; varying vec3 vE;',
        'uniform samplerCube sky; uniform vec3 lightDir; uniform vec4 baseColor;',
        'const float IOR=1.333;',
        'void main(){',
        ' vec3 N=normalize(vN); vec3 V=normalize(-vE); vec3 L=normalize(-lightDir);',
        ' vec3 R=reflect(-V,N); vec3 T=refract(-V,N,1.0/IOR);',
        ' vec3 sky1=vec3(0.78,0.88,1.0), sky2=vec3(0.55,0.65,0.76), ground=vec3(0.08,0.10,0.12);',
        ' vec3 refCol=textureCube(sky,R).rgb; vec3 refrCol=textureCube(sky,T).rgb; if(length(T)<0.001) refrCol=refCol;',
        ' float ry=clamp(R.y*0.5+0.5,0.0,1.0); vec3 fakeRefl=mix(ground,mix(sky1,sky2,ry),ry); vec3 fakeRefr=mix(sky2,ground,ry);',
        ' if(dot(refCol,refCol)<0.001) refCol=fakeRefl; if(dot(refrCol,refrCol)<0.001) refrCol=fakeRefr;',
        ' float fres=pow(1.0-max(dot(N,V),0.0),3.0); float F=0.06+0.94*fres;',
        ' vec3 env=mix(refrCol,refCol,F); vec3 H=normalize(V+L);',
        ' float NdotL=max(dot(N,L),0.0); float spec=pow(max(dot(N,H),0.0),120.0);',
        ' float horizon=abs(N.y); float band=smoothstep(0.18,0.05,horizon);',
        ' vec3 col=mix(baseColor.rgb,env,0.85); col*=(0.85+0.15*NdotL); col=mix(col*0.55,col,1.0-band*0.5); col+=spec*vec3(1.25);',
        ' gl_FragColor=vec4(pow(col,vec3(0.95)), baseColor.a); }'
      ].join('\n')
  );

  // falling droplet: photoreal shading (ASCII only)
  // 1번 코드. 물방울이 잘보임!!
  this.fallingDropletShader = new GL.Shader(
      // vertex
      'varying vec3 vN; varying vec3 vE;' +
      'void main(){' +
      '  vN = normalize(gl_NormalMatrix * gl_Normal);' +
      '  vec4 ep = gl_ModelViewMatrix * gl_Vertex;' +
      '  vE = ep.xyz;' +
      '  gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;' +
      '}',

      // fragment
      'precision highp float;' +
      'varying vec3 vN; varying vec3 vE;' +
      'uniform samplerCube sky;' +
      'uniform vec3 lightDir;' +
      'uniform float height;' +
      'uniform vec4 baseColor;' +
      'const float IOR = 1.333;' +
      'void main(){' +
      '  vec3 N = normalize(vN);' +
      '  vec3 V = normalize(-vE);' +
      '  vec3 L = normalize(-lightDir);' +
      '  vec3 R = reflect(-V, N);' +
      '  vec3 T = refract(-V, N, 1.0/IOR);' +
      '  vec3 refCol  = textureCube(sky, R).rgb;' +
      '  vec3 refrCol = textureCube(sky, T).rgb;' +
      '  if (dot(refCol,refCol)<1e-6) refCol = vec3(0.80,0.90,1.00);' +
      '  if (dot(refrCol,refrCol)<1e-6) refrCol = refCol;' +
      '  float c = clamp(dot(N,V), 0.0, 1.0);' +
      '  float fres = pow(1.0 - c, 5.0);' +
      '  float topAmt = smoothstep(0.0, 0.9, N.y);' +
      '  vec3 waterTint = mix(baseColor.rgb, vec3(0.92,0.97,1.00), 0.75);' +
      '  vec3 baseMix   = mix(refrCol, waterTint, 0.18 + 0.20*topAmt);' +
      '  vec3 col       = mix(baseMix, refCol, fres * 0.55);' +
      'col = mix(col, baseColor.rgb, 0.3);'+
      '  vec3 H = normalize(V + L);' +
      '  float spec = pow(max(dot(N,H), 0.0), 180.0);' +
      '  col += vec3(1.0,0.98,0.95) * spec * 1.05;' +
      '  float rim = pow(1.0 - c, 2.0);' +
      '  col *= (1.0 - 0.38 * rim);' +
      '  float upL = smoothstep(-1.0, -0.2, -N.y);' +
      '  upL *= exp(-height * 8.5);' +
      '  col += vec3(1.0) * upL * 0.50;' +
      '  float fwd = pow(max(dot(N, -L), 0.0), 2.0);' +
      '  col += vec3(0.12, 0.15, 0.18) * fwd * 0.25;' +
      '  float absorb = clamp(0.05 + 0.15 * exp(-height * 6.0), 0.05, 0.20);' +
      '  col *= (1.0 - absorb);' +
      '  gl_FragColor = vec4(pow(col, vec3(0.95)), baseColor.a);' +
      '}'
  );

}

Renderer.prototype.updateCaustics = function(water){
  if(!this.causticsShader) return;
  var self=this;
  this.causticTex.drawTo(function(){
    gl.clear(gl.COLOR_BUFFER_BIT);
    water.textureA.bind(0);
    self.causticsShader.uniforms({
      light:self.lightDir, water:0, sphereCenter:self.sphereCenter, sphereRadius:self.sphereRadius
    }).draw(self.waterMesh);
  });
};

Renderer.prototype.renderWater = function(water, sky) {
  // 🎯 1️⃣ 텍스처 슬롯 정확히 지정
  water.textureA.bind(0);        // 수면 높이 맵
  this.tileTexture.bind(1);      // 타일 무늬
  sky.bind(2);                   // 큐브맵 (하늘)
  this.causticTex.bind(3);       // 카우스틱 효과
  water.colorTextureA.bind(4);   // ✅ 감정 색상 텍스처

  gl.enable(gl.CULL_FACE);

  for (var i = 0; i < 2; i++) {
    gl.cullFace(i ? gl.BACK : gl.FRONT);

    // 🎯 2️⃣ waterColorTex uniform 정확히 전달
    this.waterShaders[i].uniforms({
      light: this.lightDir,
      water: 0,
      tiles: 1,
      sky: 2,
      causticTex: 3,
      waterColorTex: 4, // ✅ 이름 정확히 일치 (helper-functions와 동일해야 함)
      eye: new GL.Raytracer().eye,
      sphereCenter: this.sphereCenter,
      sphereRadius: this.sphereRadius
    }).draw(this.waterMesh);
  }

  gl.disable(gl.CULL_FACE);
};

Renderer.prototype.renderCube = function(){
  gl.enable(gl.CULL_FACE);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  this.cubeShader.uniforms({
    light:this.lightDir, water:0, tiles:1, causticTex:2,
    sphereCenter:this.sphereCenter, sphereRadius:this.sphereRadius
  }).draw(this.cubeMesh);
  gl.disable(gl.BLEND);
  gl.disable(gl.CULL_FACE);
};

// 3D droplets (falling & tip)
Renderer.prototype.renderDroplets = function (droplets, sky) {
  if (!droplets || droplets.length === 0) return;
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  for (var i = 0; i < droplets.length; i++) {
    var d = droplets[i];
    if (d.dead) continue;

    gl.pushMatrix();
    gl.translate(d.position.x, d.position.y, d.position.z);

    var sx = (d.sx !== undefined ? d.sx : d.radius);
    var sy = (d.sy !== undefined ? d.sy : d.radius);
    var sz = (d.sz !== undefined ? d.sz : d.radius);
    gl.scale(sx, sy, sz);

    sky.bind(0);
    var a = (d.alpha !== undefined ? d.alpha : 0.60);

    if (d.isTip) {
      this.waterMaterialShader.uniforms({
        sky: 0, lightDir: this.lightDir, baseColor: [0.90, 0.97, 1.0, a]
      }).draw(this.dropletMeshRound);
    } else {
      this.fallingDropletShader.uniforms({
        sky: 0,
        lightDir: this.lightDir,
        height: Math.max(d.position.y, 0.0),
        baseColor: [...(window.currentDropColor || [0.9, 0.97, 0.4]), 0.4],
        eye: this.eye,
      }).draw(this.dropletMeshSpout);
    }
    gl.popMatrix();
  }

  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
};

// ----------------------------------------------------------------------------
// Crown sequence / Tip droplet
function CrownSequence(x, z) {
  this.x = x; this.z = z; this.t = 0; this.dead = false;
  this.spawnedTip = false; this.prevAmp = 0; this.jetPeakReached = false;
}
CrownSequence.prototype.update = function(dt){
  if (this.dead) return;
  this.t += dt;
  var S = IMPACT.SLOW, t = this.t;

  if (t > 0.16*S && t <= 0.30*S) {
    var u = (t - 0.16*S) / (0.14*S);
    var k = -IMPACT.cavityAmp * (0.80 * (1.0 - 0.6*u));
    water.addDrop(this.x, this.z, IMPACT.crownR*0.70, k);
  }
  if (!this.didNeck && t > 0.45*S && t <= 0.6*S) {
    this.didNeck = true;
    addDropSoft(water, this.x, this.z, IMPACT.neckNearR, IMPACT.neckNearA);
    addDropSoft(water, this.x, this.z, IMPACT.neckCoreR, IMPACT.neckCoreA);
  }

  if (t > 0.55*S && t <= 0.75*S) {
    let u = (t - 0.55 * S) / (0.20 * S);
    let r = 0.008;
    let amp = 0.18 + (0.28 - 0.18) * Math.pow(u, 0.55);
    addDropSoft(water, this.x, this.z, r, +amp);
    addRingDoGSoft(water, this.x, this.z, r*3.0, r*2.0, -amp*0.08);
    if (this.prevAmp > 0 && amp < this.prevAmp && !this.jetPeakReached) this.jetPeakReached = true;
    this.prevAmp = amp;
  }

  if (this.jetPeakReached && !this.spawnedTip) {
    const startY = 0.06 + 0.35 * this.prevAmp;
    tipDrops.push(new TipDrop(this.x, this.z, gTime, startY));
    this.spawnedTip = true;
  }
  if (!this.didBrake && t > 0.43*S && t <= 0.48*S) {
    this.didBrake = true;
    water.addDrop   (this.x, this.z, 0.90*IMPACT.crownR, -0.028);
    addRingDoGSoft(water, this.x, this.z, 0.070, 0.020, -0.016);
  }
  if (t > 0.52*S && t <= 0.72*S) {
    var v = (t - 0.52*S) / (0.20*S);
    var damp = -0.012 * Math.exp(-4.5 * v);
    water.addDrop(this.x, this.z, IMPACT.crownR * 0.55, damp);
  }
  if (t > 0.95*S) this.dead = true;
};

function TipDrop(x, z, t0, startY) {
  this.x = x; this.z = z;
  this.attachBaseY = (startY!==undefined ? startY : 0.06);
  this.position = new GL.Vector(x, this.attachBaseY, z);
  this.velocity = new GL.Vector(0, 0.0, 0);
  this.phase = "attached"; this.birth = t0;

  this.radius = IMPACT.tipRadius;
  this.sx = this.radius; this.sy = this.radius * 0.78; this.sz = this.radius;
  this.alpha = 0.70; this.isTip = true; this.dead = false;
}
TipDrop.prototype.update = function (dt, globalTime) {
  if (this.dead) return;
  var attachT = IMPACT.tipAttachDur * IMPACT.SLOW;

  if (this.phase === "attached") {
    var tLocal = (globalTime - this.birth);
    var h = Math.min(0.075, 0.075 * (tLocal / attachT));
    this.position.y = this.attachBaseY + h;
    var w = 0.5 + 0.5 * Math.sin(tLocal * 12.0);
    this.sy = this.radius * (0.74 + (0.82-0.74)*w);
    if (tLocal >= attachT) {
      this.phase = "free";
      this.velocity.y = +IMPACT.tipLift;
      this.radius = IMPACT.tipFreeRad;
      this.sx = this.radius; this.sy = this.radius; this.sz = this.radius;
      this.alpha = 0.60;
    }
  } else if (this.phase === "free") {
    this.velocity.y -= 9.8 * dt * 0.42;
    this.position = this.position.add(this.velocity.multiply(dt));
    if (this.velocity.y < 0 && this.position.y < 0.05 && !this.hasStartedRipples) {
      this.hasStartedRipples = true; this.rippleTimer = 0;
    }
    if (this.hasStartedRipples && !this.dead) {
      this.rippleTimer += dt;
      if (this.rippleTimer > 0.09) {
        this.rippleTimer = 0;
        let radius   = 0.024 + Math.random()*0.010;
        let strength = 0.0035 + Math.random()*0.0025;
        addRingDoGSoft(water, this.x, this.z, radius, radius*0.6, -strength);
      }
    }
    if (this.position.y <= 0.0) {
      let impact = Math.min(0.008 + Math.abs(this.velocity.y)*0.015, 0.02);
      let rad = 0.026 + Math.random()*0.006;
      addRingDoGSoft(water, this.x, this.z, rad, rad*0.7, -impact);
      addDropSoft(water, this.x, this.z, rad*0.6, -impact*0.8);
      this.dead = true;
    }
  }
};

// ----------------------------------------------------------------------------
// Falling droplet (spawn)
function Droplet(x,z){
  this.position = new GL.Vector(x, 1.0, z);
  this.velocity = new GL.Vector(0, -0.8, 0);
  this.radius   = 0.02;
  this.dead     = false;
}

// ----------------------------------------------------------------------------
// App
var water, cubemap, renderer;
var angleX=-25, angleY=-200.5;
var paused=false, randomEnabled=false;
var droplets=[], tipDrops=[], sequences=[], splashQueue=[];
let currentEmotion = "CALM";  // 기본값
let currentDropColor = EMOTION_COLORS[currentEmotion];

window.onload = function(){
  var ratio = window.devicePixelRatio || 1;
  document.body.appendChild(gl.canvas);
  gl.clearColor(0.82, 0.85, 0.88, 1.0);

  function onresize(){
    var W=innerWidth,H=innerHeight;
    gl.canvas.width=W*ratio; gl.canvas.height=H*ratio;
    gl.canvas.style.width=W+'px'; gl.canvas.style.height=H+'px';
    gl.viewport(0,0,gl.canvas.width, gl.canvas.height);
    gl.matrixMode(gl.PROJECTION); gl.loadIdentity();
    gl.perspective(45, gl.canvas.width/gl.canvas.height, 0.01, 100);
    gl.matrixMode(gl.MODELVIEW);
    draw();
  }

  document.body.appendChild(gl.canvas);
  gl.clearColor(0.82,0.85,0.88,1.0);

  water = new Water();
  let isDragging = false;
  let dragMoved = false;
  document.addEventListener('click', function (e) {
    if (isDragging || dragMoved) return;  // 드래그 중에는 무시
    const rect = gl.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    spawnDropletAtScreen(x, y, currentEmotion); // 💧 한 번만 생성
  });

  const buttons = document.querySelectorAll("#emotion-buttons button");
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentEmotion = btn.dataset.emotion;
      currentDropColor = EMOTION_COLORS[currentEmotion];
      buttons.forEach(b => b.style.opacity = "0.5");
      btn.style.opacity = "1";
      window.currentDropColor = currentDropColor;
      console.log("현재 감정:", currentEmotion, "색상:", currentDropColor);
    });
  });
  window.currentDropColor = currentDropColor;
  cubemap = new Cubemap({
    xneg: document.getElementById('xneg'),
    xpos: document.getElementById('xpos'),
    yneg: document.getElementById('yneg'),
    ypos: document.getElementById('ypos'),
    zneg: document.getElementById('zneg'),
    zpos: document.getElementById('zpos')
  });
  renderer = new Renderer();
  renderer.cubemap = cubemap;
  gl.canvas.onmousedown = function (e) {
    e.preventDefault();
    isDragging = true;
    dragMoved = false;
    oldX = e.pageX;
    oldY = e.pageY;
    mode = MODE_ORBIT;
  };

  gl.canvas.onmousemove = function (e) {
    if (!isDragging) return;

    const dx = Math.abs(e.pageX - oldX);
    const dy = Math.abs(e.pageY - oldY);
    if (dx > 4 || dy > 4) dragMoved = true; // 일정 이상 움직이면 드래그로 간주

    if (mode === MODE_ADD && dragMoved) {
      const now = performance.now();
      if (now - lastDropMs > 70) {
        spawnDropletAtScreen(e.pageX, e.pageY, currentEmotion);
        lastDropMs = now;
      }
    } else if (mode === MODE_ORBIT) {
      angleY -= e.pageX - oldX;
      angleX -= e.pageY - oldY;
      angleX = Math.max(-89.999, Math.min(89.999, angleX));
      oldX = e.pageX;
      oldY = e.pageY;
    }
  };

  gl.canvas.onmouseup = function (e) {
    e.preventDefault();

    isDragging = false;
    mode = -1;
  };
  if(!water.textureA.canDrawTo() || !water.textureB.canDrawTo())
    throw new Error('render-to-float textures not supported');

  var loading=document.getElementById('loading'); if(loading) loading.innerHTML='';
  onresize();

  var RAF = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function(cb){ setTimeout(cb,0); };
  var prev = new Date().getTime();

  // --- 애니메이션 루프 (기존 animate 교체)
  function animate() {
    requestAnimationFrame(animate);
    var now = Date.now();
    var dt = (now - (animate.last || now)) / 1000.0;
    animate.last = now;

    // --- 물리 시뮬레이션 & droplet 갱신
    update(dt);
    water.updateColorTexture();
    // --- 렌더링
    draw();
  }


// 루프 시작
  RAF(animate);
  window.onresize = onresize;

// Interaction
  var oldX, oldY, mode = -1, MODE_ADD = 0, MODE_ORBIT = 1, lastDropMs = 0;

  function spawnDropletAtScreen(x, y, emotionKey) {
    console.log("📥 spawnDropletAtScreen triggered", x, y, emotionKey);

    var tracer = new GL.Raytracer();
    var ray = tracer.getRayForPixel(x * ratio, y * ratio);
    var p = tracer.eye.add(ray.multiply(-tracer.eye.y / ray.y));

    if (Math.abs(p.x) < 1 && Math.abs(p.z) < 1) {
      // 물방울 생성
      droplets.push(new Droplet(p.x, p.z));
      console.log("💧 Droplet created at", p.x, p.z);
      lastDropMs = (typeof performance !== 'undefined' ? performance.now() : Date.now());

      // ✅ 감정 색상 적용 + 물리 파동 생성
      dropWater(p.x, p.z, emotionKey);

      return true;
    }
    return false;
  }


// 새 함수 정의 (spawnDropletAtScreen 위나 아래 어느 쪽에도 가능)
  function dropWater(x, z, emotionKey) {
    // 1️⃣ 물리적 파동 먼저 생성
    addCrownSplash(water, x, z, 0.05);

    // 2️⃣ 감정 색상 결정 (기본 흰색 fallback)
    const color = EMOTION_COLORS[emotionKey] || [1.0, 1.0, 1.0];
    const radius = 0.12; // ✅ radius 정의 추가

    // 3️⃣ (선택) 경고 로그
    if (!EMOTION_COLORS[emotionKey]) {
      console.warn(`⚠️ Unknown emotionKey "${emotionKey}". Using white fallback.`);
    }

    // 4️⃣ 5초 후 색상 추가 (지연 효과)
    setTimeout(() => {
      water.addColor(x, z, color, radius);
    }, 475); // 5000ms = 5초 후 색 등장
  }



  function startDrag(x,y){
    oldX=x; oldY=y;
    mode = MODE_ORBIT; // 클릭 시 자동 생성 안 함
  }

  function duringDrag(x, y) {
    if (mode === MODE_ADD) {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (now - lastDropMs > 70 && Math.abs(x - oldX) > 5) {  // ← 살짝 움직였을 때만
        spawnDropletAtScreen(x, y, currentEmotion);
        lastDropMs = now;
      }
    } else if (mode === MODE_ORBIT) {
      angleY -= x - oldX;
      angleX -= y - oldY;
      angleX = Math.max(-89.999, Math.min(89.999, angleX));
      oldX = x; oldY = y;
    }
    if (paused) draw();
  }

  function stopDrag(){ mode=-1; }
  document.onmousedown=function(e){ e.preventDefault(); startDrag(e.pageX,e.pageY); };
  document.onmousemove=function(e){ duringDrag(e.pageX,e.pageY); };
  document.onmouseup  =function(){ stopDrag(); };
  document.ontouchstart=function(e){ if(e.touches.length===1){ e.preventDefault(); startDrag(e.touches[0].pageX,e.touches[0].pageY);} };
  document.ontouchmove =function(e){ if(e.touches.length===1){ duringDrag(e.touches[0].pageX,e.touches[0].pageY);} };
  document.ontouchend  =function(e){ if(e.touches.length===0) stopDrag(); };

  document.onkeydown=function(e){ if(e.which==' '.charCodeAt(0)) paused=!paused; };
  var btn=document.getElementById('randBtn');
  if(btn){
    btn.textContent='Random Drops: Off';
    btn.onclick=function(){
      randomEnabled=!randomEnabled;
      btn.textContent='Random Drops: '+(randomEnabled?'On':'Off');
      if(randomEnabled) btn.classList.remove('off'); else btn.classList.add('off');
    };
  }

  // update/draw
  function update(dt){
    if(dt>1) return;
    gTime += dt;

    if(randomEnabled){
      if(Math.random()<dt*0.9){
        var rx=Math.random()*1.8-0.9, rz=Math.random()*1.8-0.9;
        droplets.push(new Droplet(rx,rz));
      }
    }

    for (var k = droplets.length - 1; k >= 0; k--) {
      var d = droplets[k];
      d.velocity.y -= 9.8 * dt * 0.35;
      d.position = d.position.add(d.velocity.multiply(dt));

      if (d.wobblePhase === undefined) { d.wobblePhase = 0.0; d.wobbleAmp = 0.10; }
      var vy = Math.abs(d.velocity.y);
      var aspect = Math.min(1.25, 1.0 + 0.12 * vy);
      d.wobblePhase += dt * 12.0;
      d.wobbleAmp   *= Math.exp(-dt * 3.0);
      var wobble = 1.0 + d.wobbleAmp * Math.sin(d.wobblePhase) * 0.12;
      var ay  = aspect * wobble;
      var axz = 1.0 / Math.sqrt(aspect) / wobble;
      d.sx = d.radius * axz; d.sy = d.radius * ay; d.sz = d.radius * axz;

      if (d.position.y <= 0.0) {
        var vyI  = Math.max(0, -d.velocity.y);
        var radI = Math.max(0.015, d.radius);
        var sI   = vyI * radI;
        addCrownSplash(water, d.position.x, d.position.z, 0.07);
        sequences.push(new CrownSequence(d.position.x, d.position.z));
        droplets.splice(k, 1);
        continue;
      }
    }

    for (var s = sequences.length - 1; s >= 0; s--) {
      var ev = sequences[s];
      if (!ev.dead) ev.update(dt); else sequences.splice(s, 1);
    }
    for (var j = tipDrops.length - 1; j >= 0; j--) {
      var tp = tipDrops[j];
      if (!tp.dead) tp.update(dt, gTime);
      if (tp.dead) tipDrops.splice(j, 1);
    }

    water.stepSimulation();
    water.stepSimulation();
    water.updateNormals();
    renderer.updateCaustics(water);
  }

  function draw(){
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    gl.loadIdentity();
    gl.translate(0,0,-2.5);
    gl.rotate(-angleX,1,0,0);
    gl.rotate(-angleY,0,1,0);
    gl.translate(0,0.5,0);

    gl.enable(gl.DEPTH_TEST);
    renderer.sphereCenter = new GL.Vector(0,-2,0);
    renderer.sphereRadius = 0;
    renderer.renderCube();
    renderer.renderWater(water, cubemap);
    renderer.renderDroplets(tipDrops, cubemap);
    renderer.renderDroplets(droplets, cubemap);
    gl.disable(gl.DEPTH_TEST);
  }
};

// small helper
function mix(a,b,t){ return a*(1-t)+b*t; }
