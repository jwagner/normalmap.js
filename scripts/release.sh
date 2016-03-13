#!/bin/sh
echo $1
git checkout release
git tag -a $1
git push origin $1
g checkout master
