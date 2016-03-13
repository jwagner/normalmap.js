#!/bin/sh
#optipng -o5 demos/gfx/*/normal.png
pngquant --speed 1 -f --ext -quantized.png --quality 75-85 demos/gfx/*/ambient.png demos/gfx/*/material.png
pngquant --speed 1 -f --ext -quantized.png --quality 75-100 demos/gfx/*/normal.png
pngquant --speed 1 -f --ext -quantized.png --quality 95-100 demos/gfx/buddah/ambient.png
