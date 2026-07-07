const C=window.matchMedia("(prefers-reduced-motion: reduce)").matches,r=document.querySelector(".pipeline-canvas"),a=document.getElementById("pipeline-canvas");if(r&&a&&!C){const e=a.getContext("webgl",{alpha:!1,antialias:!1});if(!e)r.classList.add("no-webgl");else{let d=function(t,i){const o=e.createShader(t);return o?(e.shaderSource(o,i),e.compileShader(o),e.getShaderParameter(o,e.COMPILE_STATUS)?o:(console.error(e.getShaderInfoLog(o)),e.deleteShader(o),null)):null};const y=`
        attribute vec4 a_position;
        void main() { gl_Position = a_position; }
      `,v=`
        precision mediump float;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform float u_dpr;

        // Tuned via /animation-editor/ — values below come from a
        // snapshot the design owner produced in that editor. If you
        // need to retune, open /animation-editor/ and Copy values.
        void main() {
          vec2 frag = gl_FragCoord.xy;
          vec2 center = u_resolution.xy / 2.0;

          // Dot grid
          float gridSize = 6.0 * u_dpr;
          vec2 cellIdx = floor(frag / gridSize);
          vec2 cellCenter = (cellIdx + 0.5) * gridSize;
          vec2 cellOffset = cellCenter - center;

          // Local glyph coords. Aspect = 0.520 (slightly narrower than
          // the raw SVG 0.614 — chosen via editor).
          float glyphHalfH = u_resolution.y * 0.32;
          float glyphHalfW = glyphHalfH * 0.520;
          vec2 p = vec2(cellOffset.x / glyphHalfW, cellOffset.y / glyphHalfH);

          vec3 c_bg  = vec3(1.0);
          vec3 c_cta = vec3(0.133, 0.341, 0.914);  // #2257e9 --color-cta

          // ─── Outer silhouette (6-vertex polygon) ──────────────
          const float yEqUpper = 0.019;
          const float yEqLower = 0.135;

          bool insideGlyph = false;
          // signedDist: positive inside the glyph, negative outside.
          // For outside cells we approximate via the bounding L1
          // rhombus so the ambient layer below has a smooth falloff
          // even where the precise 6-vertex outside-distance would
          // require an exact polygon SDF.
          float signedDist;
          if (p.y >= -1.0 && p.y <= yEqUpper) {
            float t = (p.y + 1.0) / (yEqUpper + 1.0);
            insideGlyph = abs(p.x) <= t;
            signedDist = t - abs(p.x);
          } else if (p.y > yEqUpper && p.y < yEqLower) {
            insideGlyph = abs(p.x) <= 1.0;
            signedDist = 1.0 - abs(p.x);
          } else if (p.y >= yEqLower && p.y <= 1.0) {
            float t = (1.0 - p.y) / (1.0 - yEqLower);
            insideGlyph = abs(p.x) <= t;
            signedDist = t - abs(p.x);
          } else {
            // Cells beyond the top or bottom apex: pure L1 falloff.
            signedDist = 1.0 - (abs(p.x) + abs(p.y));
          }

          // ─── Ambient layer (outside the glyph) ────────────────
          // Elliptical reach (wider than tall) so the texture fills
          // the empty space on the sides of the glyph. Three-stop
          // palette + multi-frequency noise + per-cell hash deliver
          // the colour + shape variety the hero animation has.
          float distToCenter = length(p);
          if (!insideGlyph) {
            // Stretch x → ambient extends further on the sides.
            // x * 0.65 means the side reach is 1/0.65 = 1.54× the
            // vertical reach in normalized units.
            vec2 pAmb = vec2(p.x * 0.65, p.y);
            float ambRadial = length(pAmb);

            // Soft elliptical falloff.
            float ambFade = 1.0 - smoothstep(0.0, 1.0 + 1.140, ambRadial);
            if (ambFade < 0.01) {
              gl_FragColor = vec4(c_bg, 1.0);
              return;
            }

            // Multi-frequency noise — four superimposed sines/cosines
            // at different spatial frequencies and time multipliers.
            // Mirrors the texture richness of HeroAnimation's shader
            // which uses the same general technique.
            float n1 = sin(p.x * 4.0 + u_time * 0.55) * cos(p.y * 3.0 + u_time * 0.30);
            float n2 = sin(p.y * 5.5 - u_time * 0.45) * 0.45;
            float n3 = cos(ambRadial * 7.0 - u_time * 0.80) * 0.35;
            float n4 = sin((p.x + p.y) * 6.0 + u_time * 0.65) * 0.25;
            float val = (n1 + n2 + n3 + n4 + 2.0) / 4.0;

            // Per-cell hash so adjacent dots don't all show the same
            // colour tier — breaks up grid regularity. Cheap fract+sin
            // hash; not cryptographic but good enough for visual noise.
            float cellHash = fract(sin(dot(cellIdx, vec2(127.1, 311.7))) * 43758.5453);
            val += (cellHash - 0.5) * 0.18;

            float brightness = clamp(val, 0.0, 1.0) * ambFade;

            // Three-stop palette — same colours as HeroAnimation so
            // the two canvases on the page read as one visual system.
            //   c_amb_pale  #cfe0f1  very pale blue (ambient base)
            //   c_amb_mid   #647ced  medium blue   (wave)
            //   c_amb_str   #2257e9  full CTA      (rare hot dots)
            vec3 c_amb_pale = vec3(0.812, 0.878, 0.945);
            vec3 c_amb_mid  = vec3(0.392, 0.486, 0.929);
            vec3 c_amb_str  = vec3(0.133, 0.341, 0.914);

            // Brightness tiering — bright dots reach the strong tier,
            // middling dots are mid, dim are pale.
            vec3 ambColor;
            if (brightness > 0.65)      ambColor = c_amb_str;
            else if (brightness > 0.40) ambColor = c_amb_mid;
            else                        ambColor = c_amb_pale;

            float distFromCellCenter = length(frag - cellCenter);
            float ambRadius = mix(1.350 * 0.5 * u_dpr, 3.800 * 0.65 * u_dpr, brightness);
            float ambAlpha = 1.0 - smoothstep(ambRadius - 1.0, ambRadius, distFromCellCenter);

            vec3 color = mix(c_bg, ambColor, ambAlpha * brightness);
            gl_FragColor = vec4(color, 1.0);
            return;
          }

          float distToOuterEdge = signedDist;

          // ─── Central diamond face (path 1 in SVG) ─────────────
          // Asymmetric kite. Upper half is 0.279 tall (from apex
          // -0.260 to base 0.019); lower half is 0.362 tall (from
          // base 0.019 to tip 0.381).
          bool inCentralDiamond = false;
          if (p.y >= -0.260 && p.y <= 0.381) {
            if (p.y <= yEqUpper) {
              // Upper half of the kite: |x| ≤ (y + 0.260) / 0.279
              inCentralDiamond = abs(p.x) <= (p.y + 0.260) / 0.279;
            } else {
              // Lower half: |x| ≤ (0.381 - y) / 0.362
              inCentralDiamond = abs(p.x) <= (0.381 - p.y) / 0.362;
            }
          }

          // Per-facet brightness (snapshot values).
          float facetWeight;
          if (inCentralDiamond)   facetWeight = 0.650;
          else if (p.x > 0.0)     facetWeight = 0.750;
          else                    facetWeight = 0.550;

          // Main pulse — speed 1.650, radial freq 6.300.
          float pulse = 0.5 + 0.5 * sin(u_time * 1.650 - distToCenter * 6.300);

          // Centre-bias intensity — falloff 0.410, exponent 0.500.
          // Softer/flatter falloff than the previous default so the
          // glyph reads more evenly bright across its area while
          // still concentrating saturation at the centre.
          float centerWeight = pow(max(0.0, 1.0 - distToCenter * 0.410), 0.500);

          // Edge fade — 0.050 (very tight).
          float edgeFade = smoothstep(0.0, 0.050, distToOuterEdge);

          // Pulse mix 0.400 — pulse contributes 40% of intensity,
          // static centre-bias contributes 60%.
          float intensity = mix(centerWeight, pulse * centerWeight, 0.400);
          intensity *= edgeFade * facetWeight;

          // Dot colour gradient — CTA inner → softer outer.
          vec3 c_inner = c_cta;                            // #2257e9
          vec3 c_outer = vec3(0.500, 0.650, 0.940);        // #80a6f0
          vec3 dotColor = mix(c_inner, c_outer, smoothstep(0.10, 1.0, distToCenter));

          // Dot rendering — radius range 1.350 → 3.800 (px CSS).
          float distFromCellCenter = length(frag - cellCenter);
          float dotRadius = mix(1.350 * u_dpr, 3.800 * u_dpr, intensity);
          float dotAlpha = 1.0 - smoothstep(dotRadius - 1.5, dotRadius, distFromCellCenter);

          vec3 color = mix(c_bg, dotColor, dotAlpha * intensity);
          gl_FragColor = vec4(color, 1.0);
        }
      `,f=d(e.VERTEX_SHADER,y),h=d(e.FRAGMENT_SHADER,v);if(!f||!h)r.classList.add("no-webgl");else{const t=e.createProgram();if(e.attachShader(t,f),e.attachShader(t,h),e.linkProgram(t),!e.getProgramParameter(t,e.LINK_STATUS))console.error(e.getProgramInfoLog(t)),r.classList.add("no-webgl");else{let i=function(){const l=a.clientWidth,c=a.clientHeight,g=Math.floor(l*s),b=Math.floor(c*s);(a.width!==g||a.height!==b)&&(a.width=g,a.height=b)},o=function(){if(!n){requestAnimationFrame(o);return}i(),e.viewport(0,0,e.canvas.width,e.canvas.height),e.useProgram(t),e.enableVertexAttribArray(m),e.bindBuffer(e.ARRAY_BUFFER,p),e.vertexAttribPointer(m,2,e.FLOAT,!1,0,0),e.uniform1f(_,(performance.now()-u)*.001),e.uniform2f(x,e.canvas.width,e.canvas.height),e.uniform1f(w,s),e.drawArrays(e.TRIANGLE_STRIP,0,4),requestAnimationFrame(o)};const p=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,p),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,1,1,1,-1,-1,1,-1]),e.STATIC_DRAW);const m=e.getAttribLocation(t,"a_position"),_=e.getUniformLocation(t,"u_time"),x=e.getUniformLocation(t,"u_resolution"),w=e.getUniformLocation(t,"u_dpr"),s=Math.min(window.devicePixelRatio||1,2);let n=!0,u=performance.now();new IntersectionObserver(l=>{for(const c of l)n=c.isIntersecting,n&&(u=performance.now())},{threshold:0}).observe(a),window.addEventListener("resize",i,{passive:!0}),requestAnimationFrame(o)}}}}
