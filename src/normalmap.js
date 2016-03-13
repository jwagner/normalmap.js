var bulk = require('bulk-require');
var shaderSources = bulk(__dirname, ['shaders/*.glsl']).shaders;
var ShaderManager = require('./shader-manager');
var FBO = require('./fbo');

const NORMAL_SAMPLER = 0;
const BASE_COLOR_SAMPLER = 1;
const MATERIAL_SAMPLER = 2;
const AMBIENT_SAMPLER = 3;
const FRAMEBUFFER_SAMPLER = 4;

var IMMUTABLE_PROPERTIES = 'canvas repeat singlePass'.split();

function normalmap(options){
    options = assign({
        metalness: 1,
        roughness: 1,
        ambient: 1,
        baseColor: new Float32Array([0.5, 0.5, 0.5])
    }, options);
    var canvas = options.canvas;

    if(canvas == null) throw new Error('normalmap() canvas is required');

    if(options.normalMap == null) throw new Error('normalmap() normalMap is required');

    var defines = {};
    defineDefines(defines, options);

    var normalMapWidth = options.normalMap.naturalWidth || options.normalMap.width;
    var normalMapHeight = options.normalMap.naturalHeight || options.normalMap.height;

    var textureAspect = normalMapWidth / normalMapHeight;
    var viewportAspect, scale;

    function resize(){
        viewportAspect = canvas.width / canvas.height;
        scale = options.repeat ? (canvas.width / normalMapWidth) : 1;
        if(gl) {
            if((!options.singlePass)){
                fbo.unbind();
                fbo = getFBO(gl);
                fbo.bind();
            }
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }
    }

    resize();

    // these need to be reset on gl reinitializations
    var shaderManager;
    var pointLightShader, directionalLightShader, renderShader;
    var screenQuad, fbo;
    var gl;

    function initGl(){
        var glOptions = {
            // false is not supported by iOS
            premultipliedAlpha: true,
            alpha: true,
            depth: false
        };

        gl = canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);

        if(!gl){
            console.warn('webgl not supported!');
            return;
        }

        gl.blendColor(0, 0, 0, 0);
        gl.clearColor(0, 0, 0, 0);
        screenQuad = getScreenQuadBuffer(gl);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, screenQuad);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        gl.enable(gl.BLEND);
        gl.enable(gl.DITHER);
        gl.disable(gl.DEPTH_TEST);

        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ZERO);

        shaderManager = new ShaderManager(gl, shaderSources);
        if(!options.singlePass){
            fboType = null;
            fbo = getFBO(gl);
            fbo.bind();
        }
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

        configureGl();
        window.gl = gl;
    }

    function configureGl(){
        setupTextures(gl, options);
        buildShaders();
    }

    function buildShader(name, additionalDefines){
        return shaderManager.get('vertex', name + '-fragment',
            assign(additionalDefines||{}, defines));
    }

    function buildShaders(){
        defineDefines(defines, options);
        pointLightShader = buildShader('light', {IS_POINT_LIGHT: 1});
        directionalLightShader = buildShader('light', {IS_DIRECTIONAL_LIGHT: 1});
        renderShader = buildShader('render');
    }

    canvas.addEventListener("webglcontextlost", function(e) {
        gl = null;
        console.warn('lost webgl context!');
        e.preventDefault();
    }, false);

    canvas.addEventListener("webglcontextrestored", function(){
        console.warn('webgl context restored!');
        initGl();
        if(options.onContextRestored) {
            options.onContextRestored();
        }

    }, false);

    initGl();

    function getGenericUniforms(){
        return {
            uTextureAspect: options.repeat ? viewportAspect*textureAspect : 1,
            uScale: scale
        };
    }

    function getGenericLightUniforms(color){
        var uniforms = assign(getGenericUniforms(), {
            uLightColor: color,
            uMetalness: options.metalness,
            uRoughness: options.roughness,
            uBaseColor: options.baseColor,
            uNormalSampler: NORMAL_SAMPLER
        });
        if(options.baseColorMap) {
            uniforms.uBaseColorSampler = BASE_COLOR_SAMPLER;
        }
        if(options.materialMap) {
            uniforms.uMaterialSampler = MATERIAL_SAMPLER;
        }
        if(options.subSurfaceScattering){
            uniforms.uSubSurfaceScattering = options.subSurfaceScattering;
        }
        if(options.singlePass && options.ambientMap){
            uniforms.uAmbientSampler = AMBIENT_SAMPLER;
            uniforms.uAmbient = options.ambient;
        }
        return uniforms;
    }

    var fboType = null;
    var fboFormat;
    function getFBO(gl){
        var fbo;
        if(fboType) return new FBO(gl, undefined, undefined, fboType, fboFormat);
        var halfFloat = gl.getExtension('OES_texture_half_float');
        var halfFloatLinear = gl.getExtension('OES_texture_half_float_linear');
        if(halfFloat && halfFloatLinear && true){
            fbo = new FBO(gl, undefined, undefined, halfFloat.HALF_FLOAT_OES);
            if(fbo.supported){
                fboType = halfFloat.HALF_FLOAT_OES;
                return fbo;
            }
        }
        var float = gl.getExtension('OES_texture_float');
        var floatLinear = gl.getExtension('OES_texture_float_linear');
        if(float && floatLinear && false){
            fbo = new FBO(gl, undefined, undefined, gl.FLOAT);
            if(fbo.supported) {
                fboType = gl.FLOAT;
                return fbo;
            }
        }
        fboType = gl.UNSIGNED_BYTE;
        var extSRGB = gl.getExtension('EXT_sRGB');
        if(extSRGB){
            fbo = new FBO(gl, undefined, undefined, gl.UNSIGNED_BYTE, extSRGB.SRGB_ALPHA_EXT);
            if(fbo.supported) {
                fboFormat = extSRGB.SRGB_ALPHA_EXT;
                return fbo;
            }
        }
        return new FBO(gl);
    }

    var lights = {
        canvas: canvas,
        addPointLight: function(position, color){
            if(!gl) return;
            if(options.singlePass){
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            pointLightShader.use();
            var uniforms = getGenericLightUniforms(color);
            uniforms.uLightPosition = position;
            uniforms.uViewportAspect = viewportAspect;
            pointLightShader.uniforms(uniforms);
            drawBuffer(gl);
        },
        addDirectionalLight: function(direction, color){
            if(!gl) return;
            if(options.singlePass){
                gl.clear(gl.COLOR_BUFFER_BIT);
            }
            directionalLightShader.use();
            var uniforms = getGenericLightUniforms(color);
            uniforms.uLightDirection = direction;
            directionalLightShader.uniforms(uniforms);
            drawBuffer(gl);
        },
        render: function(){
            if(!gl) return;
            if(options.singlePass) return;
            fbo.unbind();
            gl.activeTexture(gl.TEXTURE0 + FRAMEBUFFER_SAMPLER);
            gl.bindTexture(gl.TEXTURE_2D, fbo.texture);

            renderShader.use();
            var uniforms = {
                uFrameBufferSampler: FRAMEBUFFER_SAMPLER
            };

            if(options.antiAliasing) {
                uniforms.uFrameBufferResolution = new Float32Array([fbo.width, fbo.height]);
            }

            if(options.ambientMap){
                assign(uniforms, getGenericUniforms());
                uniforms.uAmbientSampler = AMBIENT_SAMPLER;
                uniforms.uAmbient = options.ambient;
            }

            renderShader.uniforms(uniforms);
            gl.clear(gl.COLOR_BUFFER_BIT);
            drawBuffer(gl);
            fbo.bind();
            gl.clear(gl.COLOR_BUFFER_BIT);
        },
        configure: function(changes){
            IMMUTABLE_PROPERTIES.forEach(function(prop){
                if(prop in changes) {
                    throw new TypeError("can't configure()" + prop);
                }
            });
            assign(options, changes);
            if(gl) configureGl();
        },
        resize: resize
    };

    return lights;
}
module.exports = normalmap;

function defineDefines(defines, options){
    defines.USE_BASE_COLOR_MAP = options.baseColorMap && 1;
    defines.USE_MATERIAL_MAP = options.materialMap && 1;
    defines.USE_AMBIENT_MAP = options.ambientMap && 1;
    defines.USE_SSS = options.subSurfaceScattering && 1;
    defines.USE_FXAA = options.antiAliasing ? 1 : undefined;
    defines.USE_SINGLE_PASS = options.singlePass ? 1 : undefined;
}

function getScreenQuadBuffer(gl){
    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    var vertices = new Float32Array([
        1.0,  1.0,  0.0,
        -1.0, 1.0,  0.0,
        1.0,  -1.0, 0.0,
        -1.0, -1.0, 0.0
    ]);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    return buffer;
}

function imageToTexture(gl, image, type, repeat){
    var texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);

    var isPot = isImagePowerOfTwo(image);
    gl.texImage2D(gl.TEXTURE_2D, 0, type || gl.RGBA, type || gl.RGBA, gl.UNSIGNED_BYTE, image);
    if(isPot){
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    if(repeat && isPot){
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }
    else {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    if(isPot){
        gl.generateMipmap(gl.TEXTURE_2D);
    }
    // gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

function setupTextures(gl, options){
    if(options.normalMap == null) throw new Error('normalmap() normalMap attribute is required');

    gl.activeTexture(gl.TEXTURE0 + NORMAL_SAMPLER);
    imageToTexture(gl, options.normalMap, gl.RGBA, options.repeat);

    if(options.baseColorMap) {
        gl.activeTexture(gl.TEXTURE0 + BASE_COLOR_SAMPLER);
        imageToTexture(gl, options.baseColorMap, gl.RGB, options.repeat);
    }

    if(options.materialMap) {
        gl.activeTexture(gl.TEXTURE0 + MATERIAL_SAMPLER);
        imageToTexture(gl, options.materialMap, gl.RGB, options.repeat);
    }

    if(options.ambientMap) {
        gl.activeTexture(gl.TEXTURE0 + AMBIENT_SAMPLER);
        imageToTexture(gl, options.ambientMap, gl.RGBA, options.repeat);
    }
}

function drawBuffer(gl){
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function assign(a){
    for(var i = 1; i < arguments.length; i++){
        var b = arguments[i];
        for(var key in b){
            if(b.hasOwnProperty(key)) a[key] = b[key];
        }
    }
    return a;
}

function vec3(x, y, z){
    var v = new Float32Array(3);
    v[0] = x; v[1] = y; v[2] = z;
    return v;
}
normalmap.vec3 = vec3;

function isImagePowerOfTwo(image){
    return isPowerOfTwo(image.naturalWidth || image.width) &&
        isPowerOfTwo(image.naturalHeight || image.height);
}

function isPowerOfTwo(x) {
  return ((x !== 0) && !(x & (x - 1)));
}
