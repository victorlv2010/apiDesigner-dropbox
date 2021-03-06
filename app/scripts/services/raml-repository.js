(function() {
  'use strict';

  var FILE_EXTENSION_EXTRACTOR = /.*\.(.*)$/;
  function RamlFile (path, contents, options) {
    options = options || {};

    this.path = path;
    this.name = path.slice(path.lastIndexOf('/') + 1);
    var extensionMatch = FILE_EXTENSION_EXTRACTOR.exec(this.name);
    if (extensionMatch) {
      this.extension = extensionMatch[1];
    }

    this.contents = contents;
    this.persisted = options.persisted || false;
    this.dirty = options.dirty || !this.persisted;
  }

  angular.module('fs', ['ngCookies', 'raml', 'utils'])
    .factory('ramlRepository', function ($q, $rootScope, ramlSnippets, fileSystem) {
      var service = {};
      var defaultPath = '/';

      function RamlDirectory(path, meta, contents) {
        if (!/\/$/.exec(path)) { path = path + '/'; }
        contents = contents || [];

        var strippedPath = path.substring(0, path.length - 1);
        this.path = path;
        this.name = strippedPath.slice(strippedPath.lastIndexOf('/') + 1);
        this.meta = meta;

        var separated = { folder: [], file: [] };
        contents.forEach(function(entry) {
          separated[entry.type || 'file'].push(entry);
        });

        this.files = separated.file.map(function(file) {
          return new RamlFile(file.path, file.contents, { dirty: false, persisted: true} );
        });

        this.files.sort(function(file1, file2) {
          return file1.name.localeCompare(file2.name);
        });

        this.directories = separated.folder.map(function(directory) {
          return new RamlDirectory(directory.path, directory.meta, directory.children);
        });
      }

      RamlDirectory.prototype.createFile = function (name) {
        var file = service.createFile(name);
        this.files.push(file);

        return file;
      };

      RamlDirectory.prototype.removeFile = function (file) {
        return service.removeFile(file).then(function() {
          var index = this.files.indexOf(file);
          if (index !== -1) {
            this.files.splice(index, 1);
          }
        }.bind(this));
      };

      function handleErrorFor(file) {
        return function markFileWithError(error) {
          file.error = error;
          throw error;
        };
      }

      service.getDirectory = function (path) {
        path = path || defaultPath;
        return fileSystem.directory(path).then(function (folder) {
          return new RamlDirectory(folder.path, folder.meta, folder.children);
        });
      };

      service.saveFile = function (file) {
        function modifyFile() {
          file.dirty = false;
          file.persisted = true;

          return file;
        }

        return fileSystem.save(file.path, file.contents).then(modifyFile, handleErrorFor(file));
      };

      service.renameFile = function(file, newName) {
        var newPath = file.path.replace(file.name, newName);
        var promise = file.persisted ? fileSystem.rename(file.path, newPath) : $q.when(file);

        function modifyFile() {
          file.name = newName;
          file.path = newPath;

          return file;
        }

        return promise.then(modifyFile, handleErrorFor(file));
      };

      service.loadFile = function (file) {
        function modifyFile(data) {
          file.dirty = false;
          file.persisted = true;
          file.contents = data;

          return file;
        }

        return fileSystem.load(file.path).then(modifyFile, handleErrorFor(file));
      };

      service.removeFile = function (file) {
        function modifyFile() {
          file.dirty = false;
          file.persisted = false;
          $rootScope.$broadcast('event:raml-editor-file-removed', file);

          return Object.freeze(file);
        }

        return fileSystem.remove(file.path).then(modifyFile, handleErrorFor(file));
      };

      service.createFile = function (name) {
        var path = defaultPath + name;
        var file = new RamlFile(path, ramlSnippets.getEmptyRaml());
        if (file.extension !== 'raml') {
          file.contents = '';
        }
        $rootScope.$broadcast('event:raml-editor-file-created', file);

        return file;
      };

      return service;
    });
})();
