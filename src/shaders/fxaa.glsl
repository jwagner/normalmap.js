// based on nvidia fxaa 3.11 console https://gist.github.com/bkaradzic/6011431
// https://github.com/mitsuhiko/webgl-meincraft/blob/master/assets/shaders/fxaa.glsl
// it has been modified with little testing and is quite possibly broken now.

//   0.125 leaves less aliasing, but is softer (default!!!)
//   0.25 leaves more aliasing, and is sharper
const float fxaaEdgeThreshold = 0.125;
//   0.06 - faster but more aliasing in darks
//   0.05 - default
//   0.04 - slower and less aliasing in darks
const float fxaaConsoleEdgeThresholdMin = 0.00;

//   8.0 is sharper (default!!!)
//   4.0 is softer
//   2.0 is really soft (good only for vector graphics inputs)
const float fxaaConsoleEdgeSharpness = 8.0;

// for some reason fxaa wants gamma encoded values
// so I gamma encode on the fly
float fxaaLuma(vec4 color){
    const vec4 luma = vec4(0.299, 0.587, 0.114, 0.0);
    return gammaEncode(dot(saturate(color), luma));
}

vec4 fxaa(vec2 uv, const vec2 resolution, sampler2D sampler) {
    //     N = 0.50 (default)
    //     N = 0.33 (sharper)
    vec4 fxaaConsoleRcpFrameOpt = vec4(0.33) / vec4(-resolution.x, -resolution.y, resolution.x, resolution.y);
    vec4 fxaaConsoleRcpFrameOpt2 = vec4(2.0) / vec4(-resolution.x, -resolution.y, resolution.x, resolution.y);

    // vec2 inverseVP = vec2(1.0 / uViewportSize.x, 1.0 / uViewportSize.y);
    vec2 pixelOffset = vec2(1.0)/resolution;

    vec4 rgbNw = texture2D(sampler, (uv + vec2(-1.0, -1.0)) * pixelOffset);
    vec4 rgbNe = texture2D(sampler, (uv + vec2(1.0, -1.0)) * pixelOffset);
    vec4 rgbSw = texture2D(sampler, (uv + vec2(-1.0, 1.0)) * pixelOffset);
    vec4 rgbSe = texture2D(sampler, (uv + vec2(1.0, 1.0)) * pixelOffset);
    vec4 rgbM  = texture2D(sampler, uv);

    // ffxaa wants luma to be
    float lumaNw = fxaaLuma(rgbNw);
    float lumaNe = fxaaLuma(rgbNe);
    float lumaSw = fxaaLuma(rgbSw);
    float lumaSe = fxaaLuma(rgbSe);
    float lumaM  = fxaaLuma(rgbM);

    float lumaMaxNwSw = max(lumaNw, lumaSw);
    lumaNe += 1.0/384.0;
    float lumaMinNwSw = min(lumaNw, lumaSw);

    float lumaMaxNeSe = max(lumaNe, lumaSe);
    float lumaMinNeSe = min(lumaNe, lumaSe);

    float lumaMax = max(lumaMaxNeSe, lumaMaxNwSw);
    float lumaMin = min(lumaMinNeSe, lumaMinNwSw);

    float lumaMaxScaled = lumaMax * fxaaEdgeThreshold;

    float lumaMinM = min(lumaMin, lumaM);
    float lumaMaxScaledClamped = max(fxaaConsoleEdgeThresholdMin, lumaMaxScaled);
    float lumaMaxM = max(lumaMax, lumaM);
    float dirSwMinusNe = lumaSw - lumaNe;
    float lumaMaxSubMinM = lumaMaxM - lumaMinM;
    float dirSeMinusNw = lumaSe - lumaNw;
    // early out
    // if(lumaMaxSubMinM < lumaMaxScaledClamped) return vec4(1.0, 0.0, 0.0, 1.0);
    if(lumaMaxSubMinM < lumaMaxScaledClamped) return rgbM;

    vec2 dir = dirSwMinusNe + vec2(dirSeMinusNw, -dirSeMinusNw);

    vec2 dir1 = normalize(dir.xy);
    // this is suboptimal. It would probably be more efficient to do this in another stage.
    vec4 rgbyN1 = gammaEncode(saturate(texture2D(sampler, uv - dir1 * fxaaConsoleRcpFrameOpt.zw)));
    vec4 rgbyP1 = gammaEncode(saturate(texture2D(sampler, uv + dir1 * fxaaConsoleRcpFrameOpt.zw)));

    float dirAbsMinTimesC = min(abs(dir1.x), abs(dir1.y)) * fxaaConsoleEdgeSharpness;
    vec2 dir2 = clamp(dir1.xy / dirAbsMinTimesC, -2.0, 2.0);

    vec4 rgbyN2 = gammaEncode(saturate(texture2D(sampler, uv - dir2 * fxaaConsoleRcpFrameOpt2.zw)));
    vec4 rgbyP2 = gammaEncode(saturate(texture2D(sampler, uv + dir2 * fxaaConsoleRcpFrameOpt2.zw)));

    vec4 rgbyA = rgbyN1 + rgbyP1;
    vec4 rgbyB = ((rgbyN2 + rgbyP2) * 0.25) + (rgbyA * 0.25);

    bool twoTap = (rgbyB.y < lumaMin) || (rgbyB.y > lumaMax);

    if(twoTap) rgbyB.xyz = rgbyA.xyz * 0.5;

    return rgbyB;
}
