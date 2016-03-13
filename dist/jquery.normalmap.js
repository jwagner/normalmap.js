/* globals jQuery, normalmap */
(function() {

var $ = jQuery;

$.fn.normalmap = function(options){
    if(this.length === 0) return;
    if(this[0].tagName !== 'CANVAS') {
        throw new Error('$.fn.normalmap only works on a single <canvas> element');
    }
    return loadImages(this[0], options);
};

function loadImages(canvas, options){
    var maps = ['normalMap', 'baseColorMap', 'materialMap', 'ambientMap'];
    return $.when.apply($, $.map(maps, function(o){ return loadImage(options[o]); }))
        .then(function(){
            for(var i = 0; i < arguments.length; i++){
                options[maps[i]] = arguments[i];
            }
            if(!options.repeat) {
                canvas.width = options.normalMap.naturalWidth;
                canvas.height = options.normalMap.naturalHeight;
            }
            options.canvas = canvas;
            var lights = normalmap(options);
            $(window).on('resize', lights.resize);
            return lights;
        });
}

function loadImage(src){
    var deferred = $.Deferred();
    function trackImage(img){
        img.onload = function(){ deferred.resolve(img); };
        img.onerror = function(){ deferred.reject(new Error('image failed to load')); };
    }
    if(src){
        if(jQuery.type(src) === 'string'){
            var img = new Image();
            trackImage(img);
            img.crossorigin = 'anonymous';
            img.src = src;
        }
        // assume image
        else {
            if(src.tagName === 'IMG' && src.complete === false) {
                trackImage(src);
            }
            else {
                deferred.resolve(src);
            }
        }
    }
    else {
        deferred.resolve();
    }
    return deferred.promise();
}
$.fn.normalmap._loadImage = loadImage;

}());
