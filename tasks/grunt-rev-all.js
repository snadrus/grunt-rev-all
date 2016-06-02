"use strict";

var fs = require("fs"),
  path = require("path"),
  crypto = require("crypto");

var md5 = function(contents, algorithm, encoding, fileEncoding) { //Performance: already have data, use it!
  var hash = crypto.createHash(algorithm);
  hash.update(contents, fileEncoding);
  return hash.digest(encoding);
};

module.exports = function(grunt) {

  grunt.registerMultiTask("grunt-rev-all", "", function() {

    var options = this.options({
      encoding: "utf8",
      algorithm: "md5",
      length: 8
    });

    var done = this.async();  // grunt "promise" after step1 finds all files.
    var ctAllFiles = 0;       // files we've got. An indicator of completion.
    var findLinksCompleted = false;

    function rev2start(files) {
      files.forEach(function(filePair) {
        filePair.root = grunt.file.expand(filePair.root);
        var pairFiles = {};
        var ctStatComplete = 0;
        var ctShouldRev = 0;
        var root = grunt.file.expand(filePair.root)[0];
        filePair.src.forEach(function(filename) {
          pairFiles[filename] = {};
          fs.stat(filename, function(err, stat) {
            if (!err && stat.isFile()) {
              ctStatComplete++;
              pairFiles[filename].base = pairFiles[filename].base || path.dirname(filename);
              pairFiles[filename].rootToBase = path.relative(root, pairFiles[filename].base).split(path.sep);
              pairFiles[filename].rootToTarget = path.relative(root, filename).split(path.sep);
              var ext = path.extname(filename).toLowerCase();
              if (~filePair.hasLinks.indexOf(ext)) { // shortcut
                pairFiles[filename].hasLinks = true;
                pairFiles[filename].shouldRev = -1===filePair.noRev.indexOf(filename);
                ctShouldRev++;
              } else rename.orNot(filename, !(ext in filePair.noRev));
            } else delete pairFiles[filename]; // no Dirs

            if (Object.keys(pairFiles).length === ctStatComplete) { // have we stat'd all possibles?
              ctAllFiles = Object.keys(pairFiles).length;
              console.log('Found', ctAllFiles.toString().green ,'files. Looking for links in', 
                      ctShouldRev.toString().green , 'files.');
              findLinks(root, pairFiles);
            }
          });
        });
        Object.keys(filePair.runtimeBase).forEach(function(rtb) {
          // Depending on 'expand' being sync so it can be used in above callbacks.
          var allNeedingRename = filePair.runtimeBase[rtb];
          if (!Array.isArray(allNeedingRename))
            allNeedingRename = [allNeedingRename];
          var newBase = grunt.file.expand(rtb)[0];
          allNeedingRename.forEach(function(token) {
            grunt.file.expand(token).forEach(function (needRebase) {
              pairFiles[needRebase].base = newBase;
            });
          });
        });
        filePair.lookLocal.forEach(function(local) {
          grunt.file.expand(local).forEach(function(needLookLocal) {
            pairFiles[needLookLocal].lookLocal = true;
          });
        });        
      });
    }

    function findLinks(root, fileMap) {
      var files = Object.keys(fileMap);
      var ctFilesToLink = 0;
      var ctFilesLinked = 0;
      files.forEach(function(filename){
        if (fileMap[filename].hasLinks) {
          ctFilesToLink++;
          fs.readFile(filename, {encoding: "utf8"}, function(err, data) {
            var linksFound = {};
            function consider(fullpath, refPath) {
              for (var loc = data.indexOf(refPath); loc!==-1; loc = data.indexOf(refPath, loc+1)){
                var lenToEnd = loc + refPath.length;
                linksFound[lenToEnd] = 
                  linksFound[lenToEnd] && (linksFound[lenToEnd][1] || '').match(/\//g).length 
                        > refPath.match(/\//g).length ?  linksFound[lenToEnd] : [fullpath, refPath];
              }
            }          
            var baseToRoot = path.relative(fileMap[filename].base, root).split(path.sep);  // bunch of ../ or ['']
            var rootToBase = fileMap[filename].rootToBase;
            var lookLocal = fileMap[filename].lookLocal ? 
                path.relative(root, path.dirname(filename)) : 0;
            for (var mayLinkTo in fileMap) {
              var rootToTarget = fileMap[mayLinkTo].rootToTarget;             
              consider(mayLinkTo, '/' + rootToTarget.join('/')); // absolute paths
              if (lookLocal && !rootToTarget.join('/').indexOf(lookLocal))
                consider(mayLinkTo, rootToTarget.slice(lookLocal.split(path.sep).length).join('/'));
              for (var i=0; (i < baseToRoot.length || i < rootToTarget.length) && (!i || rootToBase[i-1]===rootToTarget[i-1]); i++) {
                var potentialPath = path.join(baseToRoot.slice(i).join('/'), rootToTarget.slice(i).join('/') );
                consider(mayLinkTo, potentialPath);
              }
            }
            var links= {};
            for (var len in linksFound) {
              var orig = linksFound[len];
              links[orig[0]] = (links[orig[0]] || {});
              links[orig[0]].usedAs = (links[orig[0]].usedAs || []);
              links[orig[0]].usedAs.push(linksFound[len][1]);
            }
            var resolveObj = {filename: filename, links: links, shouldRev: fileMap[filename].shouldRev, data: data};
            var lnCt = Object.keys(links).length;
            if (lnCt) {
              console.log(filename.cyan, "contains", lnCt.toString().green ,lnCt > 1 ? 'links.' : 'link.');
            }
            dependencyResolver.resolveObj(resolveObj);
            if (++ctFilesLinked === ctFilesToLink)
              findLinksCompleted = true;
          });  // end read file      
        }
      }); // end file loop
    }

    var dependencyResolver = (function() {
      var waitingForComplete = {};  // file --> fileobj in need
      var completedSet = {};
      var ctReplaceLinks = 0;
      var ctReplaceLinksCompleted = 0;
      return {
        fileCompleted: function(filename, newName) { // "when rename completes work on a file"
          completedSet[filename] = newName;
          Object.keys(waitingForComplete[filename] || {}).forEach(function(key) {
            var b = waitingForComplete[filename][key];
            b.refs--;
            if (!b.refs) {
              dependencyResolver.resolveObj(b);
            }
          });
          delete waitingForComplete[filename];

          if (findLinksCompleted && Object.keys(completedSet).length === ctAllFiles) // we found and fixed all files
            done();
        },
        resolveObj: function(waitBundle) { // links={canonical: {usedAs:''}}
          waitBundle.refs = 0;
          for (var link in waitBundle.links) {
            var target = waitBundle.links[link];
            if (completedSet[link]) {
              target.replaced = completedSet[link];
            } else {
              waitingForComplete[link] = waitingForComplete[link] ||{};
              waitingForComplete[link][waitBundle.filename] = waitBundle;
              waitBundle.refs++;
            }
          }
          if (!waitBundle.refs) {
            ctReplaceLinks++;
            replaceLinks(waitBundle.filename, waitBundle.links, waitBundle.data, function() {
              if (completedSet[waitBundle.filename])
                rename.addPrefix(waitBundle.filename, completedSet[waitBundle.filename]);
              else rename.hasContents(waitBundle.filename, waitBundle.data, waitBundle.shouldRev);

              if (findLinksCompleted && ctReplaceLinks === ++ctReplaceLinksCompleted) {
                dependencyResolver.handleCircular();
              }
            });
          }
        },
        handleCircular: function() { // Handles circular dependancies.
          var leftOvers;
          if (waitingForComplete.length)
            console.log("\n--------Resolving Circular References with random values.--------".red);
          for (var leftover in waitingForComplete) {
            console.log("The file " + leftover + " contains links to:");
            waitingForComplete[leftover].forEach(function(tgt) {
              console.log("\t\t", tgt.filename);
            });
          }
          while((leftOvers = Object.keys(waitingForComplete)).length) {
            var bundle = waitingForComplete[leftOvers[0]]; // Grab an unrevisioned file
            dependencyResolver.fileCompleted(
              bundle.filename,
              (bundle.shouldRev ? rename.getCircularPrefix() : '') + bundle.filename); // If name can change, do so.
          }
        }
      };
    })();

    function replaceLinks(filename, links, data, cb) {
      for (var link in links) {
        (links[link].usedAs || []).forEach(function(oneUse) {
          data = data.split(oneUse).join(path.dirname(oneUse) + '/' + links[link].replaced);
        });
      }
      fs.writeFile(filename, data, cb);
    }

    var rename = (function() {
      return {
        orNot: function(filename, condition) {
          if (condition || arguments.length===1) {
            fs.readFile(filename, function(err, contents) {
              var prefix = md5(contents, options.algorithm, "hex", options.encoding).slice(0, options.length);
              rename.addPrefix(filename, prefix);
            });
          } else dependencyResolver.fileCompleted(filename, filename);
        },
        hasContents: function(filename, contents, condition) {
          if (condition) {
            var prefix = md5(contents, options.algorithm, "hex", options.encoding).slice(0, options.length);
            rename.addPrefix(filename, prefix);
          } else dependencyResolver.fileCompleted(filename, filename);
        },
        getCircularPrefix: function() {
          return (Math.random()*Math.pow(16, options.length)).toString(16);
        },
        addPrefix: function addPrefix(filename, prefix) {
          var renamed = [prefix, path.basename(filename)].join(".");
          fs.rename(filename, path.resolve(path.dirname(filename), renamed), function() {
          });
          dependencyResolver.fileCompleted(filename, renamed);
        }
      };
    })();

    rev2start(this.files);
  });
};
