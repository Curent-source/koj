const A=window.matchMedia("(prefers-reduced-motion: reduce)").matches,s=document.querySelector(".hero-canvas"),r=document.getElementById("hero-canvas");if(s&&r&&!A){const e=r.getContext("webgl",{alpha:!1,antialias:!1});if(!e)s.classList.add("no-webgl");else{let f=function(t,a){const o=e.createShader(t);return o?(e.shaderSource(o,a),e.compileShader(o),e.getShaderParameter(o,e.COMPILE_STATUS)?o:(console.error(e.getShaderInfoLog(o)),e.deleteShader(o),null)):null};const p=`
        attribute vec4 a_position;
        void main() { gl_Position = a_position; }
      `,v=`
        precision mediump float;
        uniform float u_time;
        uniform vec2 u_resolution;
        uniform float u_dpr;

        void main() {
          vec2 fragCoord = gl_FragCoord.xy;
          // Target a constant CSS-pixel dot size across devices.
          // scale is in fragment pixels, so multiply by DPR so a
          // retina screen still produces ~3 CSS px blocks, same as
          // a standard-DPR external monitor.
          float scale = 3.0 * u_dpr;

          vec2 scaledCoord = floor(fragCoord / scale);
          vec2 uv = (scaledCoord * scale) / u_resolution.xy;

          vec2 p = uv * 2.0 - 1.0;
          p.x *= u_resolution.x / u_resolution.y;

          float n1 = sin(p.x * 4.0 + u_time * 0.6) * cos(p.y * 3.0 + u_time * 0.3);
          float n2 = sin(p.x * 2.0 - u_time * 0.8) * 0.5;
          float n3 = cos(p.y * 5.0 + u_time * 0.5) * 0.2;
          float val = n1 + n2 + n3;

          // Centered vignette — gentle edge softener for the
          // animated brightness computation.
          vec2 center = u_resolution.xy / 2.0;
          float dist = distance(fragCoord, center);
          float maxDist = length(u_resolution.xy);

          // Focal radial gate: 1 at the cluster centre (~75%, 50%)
          // on the right, 0 far from it. The smoothstep has an inner
          // plateau (30% of the radius stays at gate=1) so the deep
          // blue focus layer gets a solid core of pixels at full
          // strength on wide displays instead of just a thin focal
          // point. focalMax is sized off the wider dimension so the
          // blob scales generously on big monitors.
          vec2 focalCenter = vec2(u_resolution.x * 0.75, u_resolution.y * 0.5);
          float focalDist = distance(fragCoord, focalCenter);
          float focalMax = max(u_resolution.x * 0.30, u_resolution.y * 0.60);
          float focalGate = 1.0 - smoothstep(focalMax * 0.3, focalMax, focalDist);

          // Text-area gate, shaped as an ellipse that hugs the text
          // bounding box. The horizontal centre is computed in real
          // pixels so it stays locked to the container's actual
          // left padding regardless of viewport width — at narrow
          // viewports the container fills the screen, at wide
          // viewports it sits with big left/right margins, and the
          // gate follows it either way. Without this the blank
          // zone drifts right of the text on wide monitors.
          float containerMaxPx = 1200.0 * u_dpr;
          float containerPadPx = 32.0 * u_dpr;
          float containerLeftPx = max(0.0, (u_resolution.x - containerMaxPx) * 0.5);
          float textCenterX = containerLeftPx + containerPadPx + 280.0 * u_dpr;
          vec2 textCenter = vec2(textCenterX, u_resolution.y * 0.5);
          vec2 textRadii  = vec2(380.0 * u_dpr, u_resolution.y * 0.42);
          vec2 textDelta  = (fragCoord - textCenter) / textRadii;
          float textNorm  = length(textDelta);
          float textGate  = 1.0 - smoothstep(0.4, 1.05, textNorm);

          // Brightness used by the dither thresholding.
          //   STATIC value (left): a low base, dropped even lower
          //     under textGate so the dot density tapers smoothly
          //     to near-zero right around the text.
          //   ANIMATED value (right): the regular time-varying noise
          //     field with a soft vignette.
          //   focalGate then blends between the two with a pure
          //     interpolation — no edge, no 90° line.
          float brightStatic = mix(-0.05, -0.22, textGate);
          float brightAnim   = (val + 2.0) / 4.0 * (1.0 - (dist / maxDist) * 0.5);
          float brightness   = mix(brightStatic, brightAnim, focalGate);

          float fbx = mod(scaledCoord.x, 4.0);
          float fby = mod(scaledCoord.y, 4.0);
          float threshold = 0.0;
          if (fby < 1.0) {
            if (fbx < 1.0) threshold = 0.0;     else if (fbx < 2.0) threshold = 0.5;
            else if (fbx < 3.0) threshold = 0.125; else threshold = 0.625;
          } else if (fby < 2.0) {
            if (fbx < 1.0) threshold = 0.75;    else if (fbx < 2.0) threshold = 0.25;
            else if (fbx < 3.0) threshold = 0.875; else threshold = 0.375;
          } else if (fby < 3.0) {
            if (fbx < 1.0) threshold = 0.1875;  else if (fbx < 2.0) threshold = 0.6875;
            else if (fbx < 3.0) threshold = 0.0625; else threshold = 0.5625;
          } else {
            if (fbx < 1.0) threshold = 0.9375;  else if (fbx < 2.0) threshold = 0.4375;
            else if (fbx < 3.0) threshold = 0.8125; else threshold = 0.3125;
          }

          // Light-mode 4-stop ramp, anchored on --color-cta (#2257e9)
          // for the focus stop so the densest dither dots match the
          // brand's bright interactive blue rather than the navy.
          vec3 c_bg     = vec3(1.0, 1.0, 1.0);            // #ffffff page background
          vec3 c_ambient = vec3(0.812, 0.878, 0.945);     // #cfe0f1 pale blue
          vec3 c_wave   = vec3(0.392, 0.553, 0.929);      // ~#647ced softer cta-leaning mid
          vec3 c_focus  = vec3(0.133, 0.341, 0.914);      // #2257e9 --color-cta

          // Ambient (lightest) is the only colour the left side can
          // show. Because the static brightness on the left is very
          // low, the Bayer matrix only crosses this threshold at its
          // sparsest cells — producing the desired X-with-white
          // pattern.
          vec3 color = c_bg;
          if (brightness > threshold - 0.15) color = c_ambient;

          // Wave + focus admitted only inside the focal blob. Their
          // thresholds are pushed unreachable on the left (focalGate
          // → 0), so the medium and dark blues never appear there;
          // on the right they relax to normal so the cluster builds
          // up smoothly with no edge.
          float waveT  = threshold + 0.1  + (1.0 - focalGate) * 1.5;
          float focusT = threshold + 0.35 + (1.0 - focalGate) * 1.5;
          if (brightness > waveT)  color = c_wave;
          if (brightness > focusT) color = c_focus;

          gl_FragColor = vec4(color, 1.0);
        }
      `,h=f(e.VERTEX_SHADER,p),d=f(e.FRAGMENT_SHADER,v);if(!h||!d)s.classList.add("no-webgl");else{const t=e.createProgram();if(e.attachShader(t,h),e.attachShader(t,d),e.linkProgram(t),!e.getProgramParameter(t,e.LINK_STATUS))console.error(e.getProgramInfoLog(t)),s.classList.add("no-webgl");else{let a=function(){const l=r.clientWidth,c=r.clientHeight,x=Math.floor(l*i),b=Math.floor(c*i);(r.width!==x||r.height!==b)&&(r.width=x,r.height=b)},o=function(){if(!n){requestAnimationFrame(o);return}a(),e.viewport(0,0,e.canvas.width,e.canvas.height),e.useProgram(t),e.enableVertexAttribArray(g),e.bindBuffer(e.ARRAY_BUFFER,u),e.vertexAttribPointer(g,2,e.FLOAT,!1,0,0),e.uniform1f(w,(performance.now()-m)*.001),e.uniform2f(_,e.canvas.width,e.canvas.height),e.uniform1f(y,i),e.drawArrays(e.TRIANGLE_STRIP,0,4),requestAnimationFrame(o)};const u=e.createBuffer();e.bindBuffer(e.ARRAY_BUFFER,u),e.bufferData(e.ARRAY_BUFFER,new Float32Array([-1,1,1,1,-1,-1,1,-1]),e.STATIC_DRAW);const g=e.getAttribLocation(t,"a_position"),w=e.getUniformLocation(t,"u_time"),_=e.getUniformLocation(t,"u_resolution"),y=e.getUniformLocation(t,"u_dpr"),i=Math.min(window.devicePixelRatio||1,2);let n=!0,m=performance.now();new IntersectionObserver(l=>{for(const c of l)n=c.isIntersecting,n&&(m=performance.now())},{threshold:0}).observe(r),window.addEventListener("resize",a,{passive:!0}),requestAnimationFrame(o)}}}}
