function FBO(gl, width, height, type, format, depth){
    width = width || gl.drawingBufferWidth;
    height = height || gl.drawingBufferHeight;
    this.width = width;
    this.height = height;
    this.gl = gl;

    this.framebuffer = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, format || gl.RGBA, width, height, 0, format || gl.RGBA, type || gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    if(depth){
        this.depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depth);
    }
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);

    this.supported = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;

    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}
FBO.prototype = {
    bind: function () {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
    },
    unbind: function() {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    }
};
module.exports = FBO;
