#!/bin/bash

set -e

bundle config set --local path 'vendor/bundle'
bundle config set --local without 'test development'
bundle install --jobs=8 --retry=3
bundle config set deployment 'true'
cp Gemfile.lock Gemfile.lock.bak
rm -rf vendor/bundle/ruby/*/cache
rm -rf vendor/bundle/ruby/*/gems/*/spec
rm -rf vendor/bundle/ruby/*/gems/*/test
