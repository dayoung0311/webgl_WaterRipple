**물방울 3d로 수정 version**

1. 큐브 수정
2. 배경(시야 변경)


<추가해야 할 점>
1. 색
2. history


1. // 1번 코드. 물방울이 잘보임!!
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
    '  gl_FragColor = vec4(pow(col, vec3(0.95)), 0.62);' +
    '}'
  );

  2. //테두리가 밝고 잘 안보임(유리같은느낌..?)
  this.fallingDropletShader = new GL.Shader(
  // vertex
  `
  varying vec3 vN; varying vec3 vE;
  void main(){
    vN = normalize(gl_NormalMatrix * gl_Normal);
    vec4 ep = gl_ModelViewMatrix * gl_Vertex;
    vE = ep.xyz;
    gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
  }
  `,
  // fragment  — 투명/배경반응형 굴절 중심 + 프레넬 가장자리
  `
  precision highp float;
  varying vec3 vN; varying vec3 vE;
  uniform samplerCube sky;
  uniform vec3  lightDir;
  uniform float height;
  uniform vec4  baseColor;

  // 약한 분산(색수차)로 더 유리/물 느낌
  vec3 refractRGB(vec3 I, vec3 N){
    // R,G,B에 아주 미세한 서로 다른 IOR 적용
    const vec3 IOR = vec3(1.340, 1.333, 1.328);
    return vec3(
      refract(I, N, 1.0/IOR.r).x,
      refract(I, N, 1.0/IOR.g).y, // y를 써서 분산이 과하지 않게 살짝 비틀기
      refract(I, N, 1.0/IOR.b).z
    );
  }

  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(-vE);
    vec3 L = normalize(-lightDir);

    // 반사/굴절 방향
    vec3 R = reflect(-V, N);

    // 표면기울기 기반 왜곡(잔물결 같은 비틀림)
    float tilt = 1.0 - abs(N.y);
    R.xy += 0.04 * N.xy;
    vec3 Tdir = refract(-V, N, 1.0/1.333);
    Tdir.xy += 0.08 * N.xy * tilt;

    // 큐브맵 샘플 (환경색 그대로 반영)
    vec3 refCol  = textureCube(sky, R).rgb;
    vec3 refrCol = textureCube(sky, Tdir).rgb;

    // 배경 밝기/색감에 반응
    float envLum = dot(refCol, vec3(0.299,0.587,0.114));
    float envBoost = smoothstep(0.2, 0.9, envLum);
    refCol  *= 0.9 + 0.5 * envBoost;      // 밝은 배경일수록 반사 강함
    refrCol *= 0.95 + 0.25 * envBoost;    // 굴절도 살짝 강화

    // 내부 산란(맑은 물 휘도), 너무 푸르지 않게 얕은 tint
    vec3 tint = mix(vec3(0.85,0.93,1.0), baseColor.rgb, 0.35);
    refrCol = mix(refrCol, tint, 0.28 + 0.22 * (1.0 - abs(N.y)));

    // 프레넬(물은 R0≈0.02 정도가 자연스러움)
    float cosTheta = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.02 + (1.0 - 0.02) * pow(1.0 - cosTheta, 5.0);

    // 얇은 Beer–Lambert 흡수 (두께 ~ 가장자리에서 길어짐)
    float thickness = mix(0.35, 1.1, tilt);                 // 대충의 경로 길이 추정
    vec3  sigma = vec3(0.0, 0.015, 0.045);                  // R,G,B 흡수 계수(옅은 청색감)
    vec3  trans = exp(-sigma * thickness);
    refrCol *= trans;

    // 최종 혼합: 투과(굴절) 중심 + 가장자리는 반사(Fresnel)
    vec3 col = mix(refrCol, refCol, F);

    // 하이라이트(빛 반짝임)
    vec3 H = normalize(V + L);
    float spec = pow(max(dot(N,H), 0.0), 160.0);
    col += vec3(1.0,0.98,0.95) * spec * (0.7 + 0.5 * envBoost);

    // 실루엣 림(가장자리 얇게 밝게)
    float rim = pow(1.0 - cosTheta, 3.0);
    col += vec3(0.55,0.7,0.9) * rim * 0.18;

    // 높이에 따른 아주 약한 감쇠
    col *= (1.0 - clamp(height*0.35, 0.0, 0.25));

    // 투명도: 중심은 더 투명, 가장자리는 프레넬로 약간 덜 투명
    float a = mix(0.18, 0.42, F);   // ★ 핵심: 전체적으로 “투명”하게
    gl_FragColor = vec4(pow(col, vec3(0.95)), a);
  }
  `);

  3. // 2보다 테두리 어두운버전
this.fallingDropletShader = new GL.Shader(
  // === vertex ===
  `
  varying vec3 vN; varying vec3 vE;
  void main(){
    vN = normalize(gl_NormalMatrix * gl_Normal);
    vec4 ep = gl_ModelViewMatrix * gl_Vertex;
    vE = ep.xyz;
    gl_Position = gl_ModelViewProjectionMatrix * gl_Vertex;
  }
  `,

  // === fragment: 사진 같은 테두리/하늘푸름/아래밝음 ===
  `
  precision highp float;
  varying vec3 vN; varying vec3 vE;
  uniform samplerCube sky;
  uniform vec3  lightDir;
  uniform float height;
  uniform vec4  baseColor;

  // 하늘 그라디언트(큐브맵이 단색이어도 상단 파란기운 보정)
  vec3 skyGradient(vec3 dir){
    float y = clamp(dir.y*0.5+0.5, 0.0, 1.0);
    vec3 top = vec3(0.70,0.85,1.00);
    vec3 mid = vec3(0.60,0.75,0.92);
    vec3 bot = vec3(0.85,0.92,0.98);
    return mix(bot, mix(mid, top, smoothstep(0.2,0.9,y)), y);
  }
  vec3 groundTint(vec3 dir){
    // 바닥/수면 쪽은 밝고 약간 푸른 회색
    return vec3(0.92,0.96,1.02);
  }

  void main(){
    vec3 N = normalize(vN);
    vec3 V = normalize(-vE);
    vec3 L = normalize(-lightDir);

    // 반사/굴절
    vec3 R = reflect(-V, N);
    vec3 T = refract(-V, N, 1.0/1.333);

    // 표면 기울기에 따른 미세 왜곡(유리감)
    float tilt = 1.0 - abs(N.y);
    R.xy += 0.04 * N.xy;
    T.xy += 0.08 * N.xy * tilt;

    // 환경색 샘플
    vec3 refCol  = textureCube(sky, R).rgb;
    vec3 refrCol = textureCube(sky, T).rgb;

    // 하늘/바닥 보정(큐브맵이 단조로워도 위쪽은 푸르게, 아래쪽은 밝게)
    vec3 skyCol = skyGradient(T);      // 위쪽을 향한 굴절일수록 하늘 그라디언트
    vec3 grdCol = groundTint(T);       // 아래쪽을 향한 굴절일수록 바닥색
    float upAmount = smoothstep(0.0, 1.0, T.y*0.5+0.5);
    refrCol = mix(grdCol, skyCol, upAmount) * 0.35 + refrCol * 0.65;

    // 프레넬(가장자리 강조)
    float cosTheta = clamp(dot(N, V), 0.0, 1.0);
    float F = 0.02 + (1.0 - 0.02) * pow(1.0 - cosTheta, 5.0);

    // 두께(가장자리 두꺼움) ~ 1/|N·V|, N.y도 반영
    float thickness = mix(0.35, 1.25, tilt) * (1.2 - 0.6*cosTheta);

    // Beer–Lambert 흡수: 가장자리를 살짝 어둡고 푸르게
    vec3 sigma = vec3(0.00, 0.020, 0.055);
    vec3 trans = exp(-sigma * thickness);
    refrCol *= trans;

    // 위는 더 푸르게(하늘 투과), 아래로 갈수록 밝게(바닥/수면 반사·투과)
    float skyLift = smoothstep(0.0, 1.0, N.y*0.5+0.5);   // 위쪽을 바라볼수록↑
    refrCol = mix(refrCol, refrCol * vec3(0.85,0.93,1.05), 0.35*skyLift);
    float downBright = smoothstep(0.0,1.0, (-N.y)*0.7+0.3);
    refrCol += vec3(0.08,0.10,0.12) * downBright * 0.35;

    // 반사/굴절 혼합 — 가장자리는 반사↑ → 테두리 자연스럽게 어두워짐
    vec3 col = mix(refrCol, refCol, F);

    // 스펙룰러(빛 스팟)
    vec3 H = normalize(V + L);
    float spec = pow(max(dot(N,H), 0.0), 160.0);
    // 밝은 배경에서 스팟이 조금 더 강하도록 살짝 부스트
    float envLum = dot(refCol, vec3(0.299,0.587,0.114));
    col += vec3(1.0,0.98,0.95) * spec * (0.7 + 0.5*smoothstep(0.2,0.9,envLum));

    // 리밍(가장자리 다크 링) — 프레넬과 독립적으로 아주 얇게
    float rim = pow(1.0 - cosTheta, 2.5);
    col *= (1.0 - 0.18 * rim);

    // 높이에 따른 약한 감쇠(안개 느낌)
    col *= (1.0 - clamp(height*0.35, 0.0, 0.25));

    // 투명도: 중심은 더 투명, 가장자리는 프레넬로 덜 투명
    float alpha = mix(0.18, 0.45, F);
    gl_FragColor = vec4(pow(col, vec3(0.95)), alpha);
  }
  `
);
