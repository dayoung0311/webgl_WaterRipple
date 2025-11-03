// ============================================================================
// WebGL Water — main.js 
// ============================================================================

var gl = GL.create();
var gTime = 0.0;

const IMPACT = {
  SLOW: 2.4, // 전체 템포

  // 왕관/공동
  crownR: 0.050, crownW: 0.018, crownAmp: 0.038,
  cavityAmp: 0.045,

  // 제트(가늘고 높게)
  jetR0:   0.0028,
  jetRmin: 0.0006,
  jetAmp0: 0.030,
  jetAmp1: 0.075,

  // 목 핀치
  neckNearR: 0.0036, neckNearW: 0.0010, neckNearA: -0.70,
  neckCoreR: 0.0028, neckCoreW: 0.0010, neckCoreA: -0.60,
  neckKeepA: 0.0,

  // 팁방울
  tipAttachDur: 0.16, tipRadius: 0.0075, tipFreeRad: 0.0056, tipLift: 0.19,

  ringW2: 0.017, ringAmp2: 0.009
};
// 텍셀 크기(512 해상도 기준)
const TEXEL = 1.0 / 512.0;
const MIN_R = 3.0 * TEXEL;     // 최소 3 texels: 고주파 억제

// 너무 작은 r을 자동 보정해주는 안전 주입
function addDropSoft(water, x, z, r, strength){
  let rr = Math.max(r, MIN_R);
  // 면적 보존(반경 키우는 만큼 세기 줄여 총체적 에너지는 비슷하게)
  let sAdj = strength * (r*r) / (rr*rr);
  water.addDrop(x, z, rr, sAdj);
}

function addRingDoGSoft(water, x, z, r, width, amp){
  let rr = Math.max(r, MIN_R);
  let ww = Math.max(width, 2.0*TEXEL); // 링 폭도 최소화
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
// Water (float ping-pong textures)
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

  this.dropShader   = new GL.Shader('water-vertex','water-drop-fragment');
  this.updateShader = new GL.Shader('water-vertex','water-update-fragment');
  this.normalShader = new GL.Shader('water-vertex','water-normal-fragment');
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
// 연속 링(DoG) 주입
Water.prototype.addRingDoG = function(cx, cz, r, width, amp) {
  this.addDrop(cx, cz, r,              +amp);
  this.addDrop(cx, cz, Math.max(r-0.5*width, 0.001), -amp*0.6);
  this.addDrop(cx, cz, r+0.5*width,    -amp*0.6);
};
// ----------------------------------------------------------------------------
// 왕관 촥 (위로 튀는 립 + 이빨) — 충돌 프레임 한 번만 호출
// ----------------------------------------------------------------------------
function addCrownSplash(water, cx, cz, amp){
  const a = amp || 0.06;
  const rimR = 12*TEXEL, rimW = 7*TEXEL;

  // 얇은 +DoG
  addDropSoft(water, cx, cz, rimR, +a);
  addDropSoft(water, cx, cz, rimR-0.5*rimW, -a*0.4);
  addDropSoft(water, cx, cz, rimR+0.5*rimW, -a*0.4);

  // 이빨(로브) — 반경을 2.5~3 텍셀로, 개수는 12~14개로 적당히
  const lobes = 12, jiggle = 0.25;
  const rLobe = Math.max(rimR * 0.95, 3.0*TEXEL);
  for (let i=0;i<lobes;i++){
    let th = (i/lobes)*Math.PI*2.0;
    let jitter = 1.0 + jiggle*Math.sin(th*3.0);
    let x = cx + Math.cos(th)*rLobe*jitter;
    let z = cz + Math.sin(th)*rLobe*jitter;
    addDropSoft(water, x, z, 2.8*TEXEL, +a*0.55);
  }

  addDropSoft(water, cx, cz, 0.018, -a*0.8);                 // 중심 −
  addRingDoGSoft(water, cx, cz, 0.045, 0.020, -a*0.22);      // 외곽 −
}



// ----------------------------------------------------------------------------
// Renderer
// ----------------------------------------------------------------------------
function Renderer() {
  this.tileTexture = GL.Texture.fromImage(document.getElementById('tiles'), {
    minFilter: gl.LINEAR_MIPMAP_LINEAR, wrap: gl.REPEAT, format: gl.RGB
  });

  this.lightDir  = new GL.Vector(0.2,-1.0,0.15).unit();
  this.waterMesh = GL.Mesh.plane({detail:200});

  var helper = document.getElementById('helper-functions').text;
  this.waterShaders = [
    new GL.Shader('water-surface-vertex', helper+'\n'+document.getElementById('water-surface-abovewater-fragment').text),
    new GL.Shader('water-surface-vertex', helper+'\n'+document.getElementById('water-surface-underwater-fragment').text)
  ];

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
    if (v[1]>0) v[1]=Math.pow(v[1],2.3)*1.7; else v[1]*=0.65;
    this.dropletMeshSpout.vertices[i]=v;
    this.dropletMeshSpout.normals[i]=v;
  }
  this.dropletMeshSpout.compile();

  // 팁방울: 완전 구형
  this.dropletMeshRound = GL.Mesh.sphere({detail:24, normals:true});
  this.dropletMeshRound.compile();

  // 바닥 그림자
  this.dropletShadowMesh = GL.Mesh.plane({detail:1});
  this.dropletShadowShader = new GL.Shader(
    'varying vec2 vUV; void main(){ vUV=gl_Vertex.xy*0.5+0.5; gl_Position=gl_ModelViewProjectionMatrix*gl_Vertex; }',
    'precision mediump float; varying vec2 vUV; uniform vec4 color; void main(){ float d=length(vUV-0.5); float a=smoothstep(0.55,0.0,d); gl_FragColor=vec4(color.rgb,color.a*a); }'
  );

  // 물 재질
  this.waterMaterialShader = new GL.Shader(
    'varying vec3 vN; varying vec3 vE; void main(){ vN=normalize(gl_NormalMatrix*gl_Normal); vec4 ep=gl_ModelViewMatrix*gl_Vertex; vE=ep.xyz; gl_Position=gl_ModelViewProjectionMatrix*gl_Vertex; }',
    [
      'precision highp float;',
      'varying vec3 vN; varying vec3 vE;',
      'uniform samplerCube sky; uniform vec3 lightDir; uniform vec4 baseColor;',
      'const float IOR=1.333;',
      'void main(){',
      ' vec3 N=normalize(vN); vec3 V=normalize(-vE);',
      ' vec3 R=reflect(-V,N); vec3 T=refract(-V,N,1.0/IOR);',
      ' vec3 sky1=vec3(0.78,0.88,1.0), sky2=vec3(0.55,0.65,0.76), ground=vec3(0.08,0.10,0.12);',
      ' vec3 refCol=textureCube(sky,R).rgb; vec3 refrCol=textureCube(sky,T).rgb; if(length(T)<0.001) refrCol=refCol;',
      ' float ry=clamp(R.y*0.5+0.5,0.0,1.0); vec3 fakeRefl=mix(ground,mix(sky1,sky2,ry),ry); vec3 fakeRefr=mix(sky2,ground,ry);',
      ' if(dot(refCol,refCol)<0.001) refCol=fakeRefl; if(dot(refrCol,refrCol)<0.001) refrCol=fakeRefr;',
      ' float fres=pow(1.0-max(dot(N,V),0.0),3.0); float F=0.06+0.94*fres;',
      ' vec3 env=mix(refrCol,refCol,F); vec3 L=normalize(-lightDir); vec3 H=normalize(V+L);',
      ' float NdotL=max(dot(N,L),0.0); float spec=pow(max(dot(N,H),0.0),80.0);',
      ' float horizon=abs(N.y); float band=smoothstep(0.18,0.05,horizon);',
      ' vec3 col=mix(baseColor.rgb,env,0.85); col*=(0.85+0.15*NdotL); col=mix(col*0.55,col,1.0-band*0.5); col+=spec*vec3(1.35);',
      ' gl_FragColor=vec4(pow(col,vec3(0.95)), baseColor.a); }'
    ].join('\n')
  );
  // === Falling Droplet shader (reflection/refraction + Fresnel) ===
  this.fallingDropletShader = new GL.Shader(
      // === Vertex Shader ===
      'varying vec3 vN; varying vec3 vE;' +
      'void main(){' +
      '  vN = normalize(gl_NormalMatrix * gl_Normal);' +
      '  vec4 ep = gl_ModelViewMatrix * gl_Vertex;' +
      '  vE = ep.xyz;' +
      '  gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;' +
      '}',

      // === Fragment Shader ===
      'precision highp float;' +
      'varying vec3 vN; varying vec3 vE;' +
      'uniform samplerCube sky;' +
      'uniform vec3 lightDir;' +
      'uniform float height;' +

      'const float IOR = 1.333;' +
      'vec3 schlick(vec3 F0, float c){ return F0 + (1.0 - F0)*pow(1.0 - c, 5.0); }' +

      'void main(){' +
      '  vec3 N = normalize(vN);' +
      '  vec3 V = normalize(-vE);' +
      '  vec3 L = normalize(-lightDir);' +
      '  vec3 R = reflect(-V, N);' +
      '  vec3 T = refract(-V, N, 1.0/IOR);' +

      // 큐브맵 샘플
      '  vec3 refCol  = textureCube(sky, R).rgb;' +
      '  vec3 refrCol = textureCube(sky, T).rgb;' +
      '  if (dot(refCol,refCol)<1e-6) refCol=vec3(0.8,0.9,1.0);' +
      '  if (dot(refrCol,refrCol)<1e-6) refrCol=refCol;' +

      // Fresnel 계수 (테두리 밝게, 중앙은 투명)
      '  vec3 F0 = vec3(0.02);' +
      '  float c = clamp(dot(N,V),0.0,1.0);' +
      '  vec3 F = schlick(F0,c);' +
      '  float fres = mix(0.05, 1.0, pow(1.0 - c, 3.0));' +

      // 투명 물색 + 하늘 반사
      '  vec3 waterTint = vec3(0.92, 0.97, 1.0);' + // 아주 옅은 청색
      '  vec3 base = mix(refrCol, waterTint, 0.3);' +
      '  vec3 col = mix(base, refCol, fres * 0.4);' +

      // 하이라이트 (물 위의 빛 반짝임)
      '  vec3 H = normalize(V + L);' +
      '  float spec = pow(max(dot(N,H), 0.0), 140.0);' +
      '  col += vec3(1.0,0.98,0.95) * spec * 0.9;' +

      // 높이에 따른 약한 흡수 (낮을수록 조금 어둡게)
      '  float absorb = clamp(0.04 + 0.18 * exp(-height * 6.0), 0.04, 0.22);' +
      '  col *= (1.0 - absorb);' +

      // 투명도: 물빛 (0.55~0.7 권장)
      '  gl_FragColor = vec4(col, 0.65);' +
      '}'
) ;


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

Renderer.prototype.renderWater = function(water, sky){
  water.textureA.bind(0);
  this.tileTexture.bind(1);
  sky.bind(2);
  this.causticTex.bind(3);

  gl.enable(gl.CULL_FACE);
  for (var i=0;i<2;i++){
    gl.cullFace(i? gl.BACK : gl.FRONT);
    this.waterShaders[i].uniforms({
      light:this.lightDir, water:0, tiles:1, sky:2, causticTex:3,
      eye:new GL.Raytracer().eye, sphereCenter:this.sphereCenter, sphereRadius:this.sphereRadius
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

Renderer.prototype.renderDroplets = function(droplets, sky){
  if(!droplets || droplets.length===0) return;

  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  for (var i=0;i<droplets.length;i++){
    var d=droplets[i]; if(d.dead) continue;

    // 바닥 그림자
    var h=Math.max(d.position.y,0.0);
    var shadowSize=0.15+h*0.25;
    var shadowAlpha=0.35*Math.exp(-h*1.6);

    gl.pushMatrix();
    gl.translate(d.position.x, 0.002, d.position.z);
    gl.rotate(-90,1,0,0);
    gl.scale(shadowSize, shadowSize, shadowSize);
    this.dropletShadowShader.uniforms({ color:[0,0,0,shadowAlpha] }).draw(this.dropletShadowMesh);
    gl.popMatrix();

    // 물체
    gl.pushMatrix();
    gl.translate(d.position.x, d.position.y, d.position.z);

    var sx = (d.sx !== undefined ? d.sx : d.radius);
    var sy = (d.sy !== undefined ? d.sy : d.radius);
    var sz = (d.sz !== undefined ? d.sz : d.radius);
    gl.scale(sx, sy, sz);

    sky.bind(0);
    var a = (d.alpha !== undefined ? d.alpha : 0.50);
   if (d.isTip) {
     // 팁 방울: 기존 메터리얼(구형) 그대로
      this.waterMaterialShader.uniforms({
        sky:0, lightDir:this.lightDir, baseColor:[0.90,0.97,1.0,a]
      }).draw(this.dropletMeshRound);
    } else {
      // ⬅⬅ 낙하(처음) 물방울: 반사/굴절+Fresnel 전용 셰이더 사용
     this.fallingDropletShader.uniforms({
        sky:0, lightDir:this.lightDir, height: Math.max(d.position.y,0.0)
     }).draw(this.dropletMeshSpout);    }
    gl.popMatrix();
  }

  gl.disable(gl.BLEND);
};

// ----------------------------------------------------------------------------
// Crown → Cavity 유지 → Neck → Jet(초소형+보상) → Brake → Settle
// ----------------------------------------------------------------------------
function CrownSequence(x, z) {
  this.x = x;
  this.z = z;
  this.t = 0;
  this.dead = false;
  this.spawnedTip = false;
  this.didJet = false;
  this.prevAmp = 0; // 전 프레임 제트 세기 기억
  this.jetPeakReached = false;
}

CrownSequence.prototype.update = function(dt){
  if (this.dead) return;
  this.t += dt;
  var S = IMPACT.SLOW;
  var t = this.t;

  // 왕관 사그라짐 동안 공동(−) 유지 구간
  if (t > 0.16*S && t <= 0.30*S) {
    var u = (t - 0.16*S) / (0.14*S);
    var k = -IMPACT.cavityAmp * (0.80 * (1.0 - 0.6*u));
    water.addDrop(this.x, this.z, IMPACT.crownR*0.70, k);
  }

  // neck 핀치: 제트 직전 1회
if (!this.didNeck && t > 0.45*S && t <= 0.6*S) {
  this.didNeck = true;
 addDropSoft(water, this.x, this.z, IMPACT.neckNearR, IMPACT.neckNearA);
 addDropSoft(water, this.x, this.z, IMPACT.neckCoreR, IMPACT.neckCoreA);
}


  // 제트: 가늘고 높게 솟음
if (t > 0.55 * S && t <= 0.75 * S) {
  let u = (t - 0.55 * S) / (0.20 * S);
  let r = 0.008;
  let amp = 0.18 + (0.28 - 0.18) * Math.pow(u, 0.55);

  // 실제 제트 주입
  addDropSoft(water, this.x, this.z, r, +amp);
  addRingDoGSoft(water, this.x, this.z, r*3.0, r*2.0, -amp*0.08); // 보상 약화

  // 최고점 감지 로직
  if (this.prevAmp > 0 && amp < this.prevAmp && !this.jetPeakReached) {
      this.jetPeakReached = true; // 제트가 꺾이는 순간 기록
    }
    this.prevAmp = amp;
    this.didJet = true;
  }
  // 팁 방울 — 제트가 최고점에서 꺾이는 순간 분리
  if (this.jetPeakReached && !this.spawnedTip) {
    const startY = 0.06 + 0.35 * this.prevAmp; // 제트가 셀수록 더 높은 곳에서 분리
    tipDrops.push(new TipDrop(this.x, this.z, gTime, startY));
    this.spawnedTip = true;
  }
  // 제트 직후 강한 브레이크
  if (!this.didBrake && t > 0.43*S && t <= 0.48*S) {
    this.didBrake = true;
    water.addDrop   (this.x, this.z, 0.90*IMPACT.crownR, -0.028);
    water.addRingDoG(this.x, this.z, 0.070, 0.020,      -0.016);
  }
  // 감쇠 꼬리
  if (t > 0.52*S && t <= 0.72*S) {
    var v = (t - 0.52*S) / (0.20*S);
    var damp = -0.012 * Math.exp(-4.5 * v);
    water.addDrop(this.x, this.z, IMPACT.crownR * 0.55, damp);
  }

  if (t > 0.95*S) this.dead = true;
};

// ----------------------------------------------------------------------------
// Tip droplet: attached(눌린 구) → free(구형) → 낙하 splash(− 위주)
// ----------------------------------------------------------------------------
function TipDrop(x, z, t0, startY) {
  this.x = x; this.z = z;
  this.attachBaseY = (startY!==undefined ? startY : 0.06); // 제트 끝 높이 기반
  this.position = new GL.Vector(x, this.attachBaseY, z);
  this.velocity = new GL.Vector(0, 0.0, 0);

  this.phase = "attached";
  this.birth = t0;

  this.radius = IMPACT.tipRadius;
  this.sx = this.radius;
  this.sy = this.radius * 0.78;
  this.sz = this.radius;

  this.alpha = 0.70;
  this.isTip = true;
  this.dead = false;
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
  }
  else if (this.phase === "free") {
  this.velocity.y -= 9.8 * dt * 0.42;
  this.position = this.position.add(this.velocity.multiply(dt));

  // 제트 하강 중 잔 파동 — 높이에 따라 약한 파동을 지속 생성
  if (this.velocity.y < 0 && this.position.y < 0.05 && !this.hasStartedRipples) {
    // 처음 수면에 근접했을 때만 플래그 ON
    this.hasStartedRipples = true;
    this.rippleTimer = 0;
  }

  // 0.05초 → 0.09초 (빈도 감소), 반경을 0.024~0.034로 넓힘(저주파화)
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
// Falling droplets (낙하 방울 - 충돌 트리거)
// ----------------------------------------------------------------------------
function Droplet(x,z){
  // 약간 높은 곳에서 시작해 충돌시 에너지 확보
  this.position = new GL.Vector(x, 1.0, z);
  this.velocity = new GL.Vector(0, -0.8, 0);
  this.radius   = 0.03;
  this.dead     = false;
}

var droplets   = [];
var tipDrops   = [];
var sequences  = [];
var splashQueue = [];

// ----------------------------------------------------------------------------
// App bootstrap
// ----------------------------------------------------------------------------
var water, cubemap, renderer;
var angleX=-25, angleY=-200.5;
var paused=false, randomEnabled=false;

window.onload = function(){
  var ratio = window.devicePixelRatio || 1;

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
  renderer = new Renderer();
  cubemap = new Cubemap({
    xneg: document.getElementById('xneg'),
    xpos: document.getElementById('xpos'),
    yneg: document.getElementById('ypos'),
    ypos: document.getElementById('ypos'),
    zneg: document.getElementById('zneg'),
    zpos: document.getElementById('zpos')
  });

  if(!water.textureA.canDrawTo() || !water.textureB.canDrawTo())
    throw new Error('render-to-float textures not supported');

  var loading=document.getElementById('loading'); if(loading) loading.innerHTML='';
  onresize();

  var RAF = window.requestAnimationFrame || window.webkitRequestAnimationFrame || function(cb){ setTimeout(cb,0); };
  var prev = new Date().getTime(); var dropTimer=0;

  function animate(){
    var now=new Date().getTime();
    if(!paused){ update((now-prev)/1000); draw(); }
    prev=now; RAF(animate);
  }
  RAF(animate);
  window.onresize=onresize;

  // --- Interaction ---
  var oldX,oldY,mode=-1,MODE_ADD=0,MODE_ORBIT=1,lastDropMs=0;
  function spawnDropletAtScreen(x,y){
    var tracer=new GL.Raytracer();
    var ray=tracer.getRayForPixel(x*ratio,y*ratio);
    var p=tracer.eye.add(ray.multiply(-tracer.eye.y/ray.y));
    if(Math.abs(p.x)<1 && Math.abs(p.z)<1){
      droplets.push(new Droplet(p.x,p.z));
      lastDropMs=(typeof performance!=='undefined'?performance.now():Date.now());
      return true;
    }
    return false;
  }
  function startDrag(x,y){ oldX=x; oldY=y; mode = (spawnDropletAtScreen(x,y)? MODE_ADD: MODE_ORBIT); }
  function duringDrag(x,y){
    if(mode===MODE_ADD){
      if((typeof performance!=='undefined'?performance.now():Date.now())-lastDropMs>70){
        spawnDropletAtScreen(x,y);
      }
    } else if(mode===MODE_ORBIT){
      angleY -= x-oldX; angleX -= y-oldY;
      angleX = Math.max(-89.999, Math.min(89.999, angleX));
      oldX=x; oldY=y;
    }
    if(paused) draw();
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

  // --- Update/Draw ---
  function update(dt){
    if(dt>1) return;
    gTime += dt;
    dropTimer += dt;

    if(randomEnabled && dropTimer>=1.0){
      dropTimer=0;
      var rx=Math.random()*1.8-0.9, rz=Math.random()*1.8-0.9;
      droplets.push(new Droplet(rx,rz));
    }

    // 1) 낙하 물리 & 충돌 처리 (촥: 같은 프레임 주입)
    for (var k = droplets.length - 1; k >= 0; k--) {
      var d = droplets[k];
      d.velocity.y -= 9.8 * dt * 0.35;
      d.position = d.position.add(d.velocity.multiply(dt));

      // [추가] 속도 기반 스쿼시/스트레치 + 살짝의 감쇠 진동
      if (d.wobblePhase === undefined) { d.wobblePhase = 0.0; d.wobbleAmp = 0.10; }
      var vy = Math.abs(d.velocity.y);
      var aspect = Math.min(1.25, 1.0 + 0.12 * vy);     // 세로로 길어짐 비율
      d.wobblePhase += dt * 12.0;
      d.wobbleAmp   *= Math.exp(-dt * 3.0);
      var wobble = 1.0 + d.wobbleAmp * Math.sin(d.wobblePhase) * 0.12;

      var ay  = aspect * wobble;
      var axz = 1.0 / Math.sqrt(aspect) / wobble;

      d.sx = d.radius * axz;    // 가로
      d.sy = d.radius * ay;     // 세로
      d.sz = d.radius * axz;
      if (d.position.y <= 0.0) {
        // 충돌 강도(속도×반경)
        var vy  = Math.max(0, -d.velocity.y);
        var rad = Math.max(0.015, d.radius);
        var s   = vy * rad;

        var rimAmp    =  Math.min( 0.020, 0.40 * s);  // + 림(왕관)
        var centerAmp = -Math.min( 0.028, 0.55 * s);  // − 중앙 파임
        var outerAmp  = -Math.min( 0.012, 0.18 * s);  // − 외곽 완충

       addCrownSplash(water, d.position.x, d.position.z, 0.07);

        // 타임라인 시작
        sequences.push(new CrownSequence(d.position.x, d.position.z));

        droplets.splice(k, 1);
        continue;
      }
    }

    // 2) 시퀀스/팁방울 업데이트 (시뮬 이전에 주입되도록 먼저 호출)
    for (var s = sequences.length - 1; s >= 0; s--) {
      var ev = sequences[s];
      if (!ev.dead) ev.update(dt); else sequences.splice(s, 1);
    }
    for (var j = tipDrops.length - 1; j >= 0; j--) {
      var tp = tipDrops[j];
      if (!tp.dead) tp.update(dt, gTime);
      if (tp.dead) tipDrops.splice(j, 1);
    }

    // 3) 물 시뮬레이션
    water.stepSimulation();
    water.stepSimulation();
    water.updateNormals();
    renderer.updateCaustics(water);

    // 4) 예약 스플래시(옵션)
    for (var i = splashQueue.length - 1; i >= 0; i--) {
      splashQueue[i].delay -= dt;
      if (splashQueue[i].delay <= 0) {
        water.addDrop(splashQueue[i].x, splashQueue[i].z, splashQueue[i].r, splashQueue[i].s);
        splashQueue.splice(i, 1);
      }
    }
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
    renderer.renderDroplets(tipDrops, cubemap);   // 팁 방울(제트 이후)
    renderer.renderDroplets(droplets, cubemap);   // 낙하 방울(충돌 전까지만)
    gl.disable(gl.DEPTH_TEST);
  }
};

// --- small helper ---
function mix(a,b,t){ return a*(1-t)+b*t; }
