(function () {
  var form = document.getElementById('form');
  var loader = document.getElementById('loader');
  var errorBlock = document.getElementById('error');
  var resultBlock = document.getElementById('result');
  var resultImage = document.getElementById('resultImage');
  var linkPng = document.getElementById('linkPng');
  var linkSvg = document.getElementById('linkSvg');
  var submitBtn = document.getElementById('submitBtn');

  var POLL_INTERVAL_MS = 3000;

  function getAuthHeaders() {
    var token = localStorage.getItem('access_token');
    var headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
  }

  function setLoading(loading) {
    if (submitBtn) submitBtn.disabled = loading;
    if (form) {
      form.querySelectorAll('input, textarea, select').forEach(function (el) {
        el.disabled = loading;
      });
    }
    if (loading) {
      loader.classList.remove('hidden');
      errorBlock.classList.add('hidden');
      resultBlock.classList.add('hidden');
      errorBlock.textContent = '';
    } else {
      loader.classList.add('hidden');
    }
  }

  function showError(message) {
    errorBlock.textContent = message;
    errorBlock.classList.remove('hidden');
    resultBlock.classList.add('hidden');
  }

  function showResult(pngUrl, svgUrl) {
    errorBlock.classList.add('hidden');
    resultImage.src = pngUrl;
    linkPng.href = pngUrl;
    linkPng.download = 'image.png';
    linkSvg.href = svgUrl;
    linkSvg.download = 'image.svg';
    resultBlock.classList.remove('hidden');
  }

  function updateAuthUI() {
    var token = localStorage.getItem('access_token');
    var formWrap = document.getElementById('authFormWrap');
    var loggedWrap = document.getElementById('authLoggedWrap');
    var tabsEl = document.getElementById('mainTabs');
    if (token) {
      formWrap.classList.add('hidden');
      loggedWrap.classList.remove('hidden');
      if (tabsEl) tabsEl.classList.remove('hidden');
      if (form) form.querySelectorAll('input, textarea, select, button').forEach(function (el) { el.disabled = false; });
    } else {
      formWrap.classList.remove('hidden');
      loggedWrap.classList.add('hidden');
      if (tabsEl) tabsEl.classList.add('hidden');
      if (form) form.querySelectorAll('input, textarea, select, button').forEach(function (el) { el.disabled = true; });
    }
  }

  document.getElementById('authForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;
    var errEl = document.getElementById('authError');
    errEl.classList.add('hidden');
    fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password }),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          errEl.textContent = result.data.message || 'Ошибка входа';
          errEl.classList.remove('hidden');
          return;
        }
        if (result.data.access_token) {
          localStorage.setItem('access_token', result.data.access_token);
          updateAuthUI();
          loadLibraryList();
        }
      })
      .catch(function () {
        errEl.textContent = 'Ошибка сети';
        errEl.classList.remove('hidden');
      });
  });

  document.getElementById('logoutBtn').addEventListener('click', function () {
    localStorage.removeItem('access_token');
    updateAuthUI();
  });

  var typeSelect = document.getElementById('type');
  var compositeCheckbox = document.getElementById('composite');
  var useLibraryWrap = document.getElementById('useLibraryWrap');
  var useLibraryCheckbox = document.getElementById('useLibrary');
  var mapOptionsWrap = document.getElementById('mapOptionsWrap');

  function updateVisibility() {
    var type = typeSelect.value;
    var isPlotView = type === 'plot_view';
    var isPlotMap = type === 'plot_map';
    compositeCheckbox.disabled = !isPlotView;
    if (!isPlotView && compositeCheckbox.checked) compositeCheckbox.checked = false;
    useLibraryWrap.style.display = isPlotView ? 'flex' : 'none';
    if (!isPlotView && useLibraryCheckbox.checked) useLibraryCheckbox.checked = false;
    var sceneViewWrap = document.getElementById('sceneViewWrap');
    if (sceneViewWrap) sceneViewWrap.style.display = isPlotView ? 'flex' : 'none';
    if (!isPlotView && document.getElementById('sceneView') && document.getElementById('sceneView').checked) document.getElementById('sceneView').checked = false;
    if (isPlotMap) mapOptionsWrap.classList.remove('hidden'); else mapOptionsWrap.classList.add('hidden');
  }
  if (typeSelect) typeSelect.addEventListener('change', updateVisibility);
  updateVisibility();

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!localStorage.getItem('access_token')) {
      showError('Сначала войдите в систему.');
      return;
    }
    var description = document.getElementById('description').value.trim();
    var accents = document.getElementById('accents').value.trim();
    var type = document.getElementById('type').value;
    var composite = document.getElementById('composite').checked;
    var useLibrary = document.getElementById('useLibrary').checked;
    var sceneViewChecked = document.getElementById('sceneView') && document.getElementById('sceneView').checked;
    var mapBiomeVal = document.getElementById('mapBiome').value.trim();
    var edgeN = document.getElementById('edgeN').value.trim();
    var edgeS = document.getElementById('edgeS').value.trim();
    var edgeW = document.getElementById('edgeW').value.trim();
    var edgeE = document.getElementById('edgeE').value.trim();

    if (!description) {
      showError('Введите описание.');
      return;
    }

    setLoading(true);

    var body = {
      description: description,
      accents: accents,
      type: type,
      composite: composite,
      useLibrary: useLibrary,
    };
    if (type === 'plot_view' && sceneViewChecked) body.sceneView = 'first_person';
    if (type === 'plot_map') {
      if (mapBiomeVal) body.mapBiome = mapBiomeVal;
      var mapEdges = {};
      if (edgeN) mapEdges.n = edgeN;
      if (edgeS) mapEdges.s = edgeS;
      if (edgeW) mapEdges.w = edgeW;
      if (edgeE) mapEdges.e = edgeE;
      if (Object.keys(mapEdges).length > 0) body.mapEdges = mapEdges;
    }

    fetch('/tasks', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.message || data.error || 'Ошибка сервера');
          return data;
        });
      })
      .then(function (data) {
        var taskId = data.taskId;
        if (!taskId) {
          showError('Сервер не вернул taskId.');
          setLoading(false);
          return;
        }
        var pollTimer = setInterval(function () {
          fetch('/tasks/' + taskId, { headers: getAuthHeaders() })
            .then(function (res) { return res.json(); })
            .then(function (task) {
              if (task.status === 'completed') {
                clearInterval(pollTimer);
                var pngUrl = task.pngUrl || ('/output/web/' + taskId + '.png');
                var svgUrl = task.svgUrl || ('/output/web/' + taskId + '.svg');
                showResult(pngUrl, svgUrl);
                setLoading(false);
              } else if (task.status === 'failed') {
                clearInterval(pollTimer);
                showError(task.error || 'Генерация не удалась.');
                setLoading(false);
              }
            })
            .catch(function () {
              clearInterval(pollTimer);
              showError('Ошибка при опросе статуса.');
              setLoading(false);
            });
        }, POLL_INTERVAL_MS);
      })
      .catch(function (err) {
        showError(err.message || 'Не удалось запустить генерацию.');
        setLoading(false);
      });
  });

  function setLibraryLoading(loading) {
    var btn = document.getElementById('librarySubmitBtn');
    if (btn) btn.disabled = loading;
    var libLoader = document.getElementById('libraryLoader');
    var err = document.getElementById('libraryError');
    if (loading) {
      libLoader.classList.remove('hidden');
      err.classList.add('hidden');
      err.textContent = '';
    } else {
      libLoader.classList.add('hidden');
    }
  }
  function showLibraryError(message) {
    var err = document.getElementById('libraryError');
    err.textContent = message;
    err.classList.remove('hidden');
  }
  function loadLibraryList() {
    if (!localStorage.getItem('access_token')) return;
    fetch('/library', { headers: getAuthHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.ok || !data.entries) return;
        var listEl = document.getElementById('libraryList');
        if (!listEl) return;
        if (data.entries.length === 0) {
          listEl.innerHTML = '<p class="library-empty">В библиотеке пока нет элементов. Добавьте первый через форму выше.</p>';
          return;
        }
        listEl.innerHTML = '<ul class="library-entries">' + data.entries.map(function (e) {
          return '<li><span class="lib-type">' + e.type + '</span> ' + (e.description || e.id) + ' <span class="lib-meta">' + e.width + '×' + e.height + '</span></li>';
        }).join('') + '</ul>';
      })
      .catch(function () {});
  }

  var libraryForm = document.getElementById('libraryForm');
  if (libraryForm) {
    libraryForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!localStorage.getItem('access_token')) {
        showLibraryError('Сначала войдите в систему.');
        return;
      }
      var description = document.getElementById('libDescription').value.trim();
      if (!description) {
        showLibraryError('Введите описание элемента.');
        return;
      }
      setLibraryLoading(true);
      fetch('/library', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ description: description }),
      })
        .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (result) {
          if (!result.ok) {
            showLibraryError(result.data.message || result.data.error || 'Ошибка сервера');
            return;
          }
          document.getElementById('libDescription').value = '';
          loadLibraryList();
        })
        .catch(function (err) {
          showLibraryError(err.message || 'Не удалось добавить элемент.');
        })
        .finally(function () {
          setLibraryLoading(false);
        });
    });
  }

  function switchMainTab(tabName) {
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-tab') === tabName);
    });
    document.querySelectorAll('.tab-panel').forEach(function (p) {
      var id = p.id;
      var isGen = id === 'sectionGeneration';
      var isLib = id === 'sectionLibrary';
      var isAdmin = id === 'sectionAdmin';
      p.classList.toggle('active',
        (tabName === 'generation' && isGen) ||
        (tabName === 'library' && isLib) ||
        (tabName === 'admin' && isAdmin));
    });
    if (tabName === 'admin') {
      loadPromptsList();
      loadGenerationParams();
    }
  }

  document.querySelectorAll('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      switchMainTab(t.getAttribute('data-tab'));
    });
  });

  var mainTabs = document.getElementById('mainTabs');
  if (mainTabs && !localStorage.getItem('access_token')) {
    mainTabs.classList.add('hidden');
  }

  function switchAdminTab(adminTabName) {
    document.querySelectorAll('.admin-tab').forEach(function (t) {
      t.classList.toggle('active', t.getAttribute('data-admin-tab') === adminTabName);
    });
    document.querySelectorAll('.admin-panel').forEach(function (p) {
      p.classList.toggle('active',
        (adminTabName === 'prompts' && p.id === 'adminPrompts') ||
        (adminTabName === 'params' && p.id === 'adminParams') ||
        (adminTabName === 'test' && p.id === 'adminTest'));
    });
    if (adminTabName === 'params') loadGenerationParams();
  }

  document.querySelectorAll('.admin-tab').forEach(function (t) {
    t.addEventListener('click', function () {
      switchAdminTab(t.getAttribute('data-admin-tab'));
    });
  });

  function loadPromptsList() {
    if (!localStorage.getItem('access_token')) return;
    fetch('/prompts', { headers: getAuthHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (paths) {
        var sel = document.getElementById('promptsList');
        if (!sel) return;
        sel.innerHTML = '';
        if (!Array.isArray(paths) || paths.length === 0) {
          sel.innerHTML = '<option value="">— нет файлов —</option>';
          return;
        }
        paths.forEach(function (path) {
          var opt = document.createElement('option');
          opt.value = path;
          opt.textContent = path;
          sel.appendChild(opt);
        });
      })
      .catch(function () {});
  }

  document.getElementById('promptsLoadBtn').addEventListener('click', function () {
    var sel = document.getElementById('promptsList');
    var path = sel && sel.value;
    if (!path) return;
    if (!localStorage.getItem('access_token')) return;
    fetch('/prompts/' + encodeURIComponent(path).replace(/%2F/g, '/'), { headers: getAuthHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var ta = document.getElementById('promptContent');
        if (ta) ta.value = data.content != null ? data.content : '';
        document.getElementById('promptsSaveStatus').textContent = '';
      })
      .catch(function () {
        document.getElementById('promptsSaveStatus').textContent = 'Ошибка загрузки';
      });
  });

  document.getElementById('promptsSaveBtn').addEventListener('click', function () {
    var sel = document.getElementById('promptsList');
    var path = sel && sel.value;
    var ta = document.getElementById('promptContent');
    if (!path || !ta) return;
    if (!localStorage.getItem('access_token')) return;
    var statusEl = document.getElementById('promptsSaveStatus');
    statusEl.textContent = 'Сохранение…';
    fetch('/prompts/' + encodeURIComponent(path).replace(/%2F/g, '/'), {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ content: ta.value }),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Ошибка сохранения');
        statusEl.textContent = 'Сохранено';
        setTimeout(function () { statusEl.textContent = ''; }, 2000);
      })
      .catch(function () {
        statusEl.textContent = 'Ошибка';
      });
  });

  function loadGenerationParams() {
    if (!localStorage.getItem('access_token')) return;
    fetch('/generation-params', { headers: getAuthHeaders() })
      .then(function (res) { return res.json(); })
      .then(function (params) {
        function setNum(id, val) {
          var el = document.getElementById(id);
          if (el && val != null) el.value = String(val);
        }
        function setCheck(id, val) {
          var el = document.getElementById(id);
          if (el) el.checked = !!val;
        }
        setNum('paramSceneWidth', params.sceneWidth);
        setNum('paramSceneHeight', params.sceneHeight);
        setNum('paramObjectSize', params.objectSize);
        setNum('paramMapWidth', params.mapWidth);
        setNum('paramMapHeight', params.mapHeight);
        setNum('paramMaxConcurrentJobs', params.maxConcurrentJobs);
        setCheck('paramCompositeScene', params.compositeScene);
        setNum('paramGridCols', params.gridCols);
        setNum('paramGridRows', params.gridRows);
        setNum('paramCompositeConcurrency', params.compositeConcurrency);
        setNum('paramMaxGenerationTokens', params.maxGenerationTokens);
        setNum('paramMaxSvgElements', params.maxSvgElements);
        setNum('paramPixelScale', params.pixelScale);
        setNum('paramQuality', params.quality);
        var fmt = document.getElementById('paramOutputFormat');
        if (fmt && params.outputFormat) fmt.value = params.outputFormat;
        var bg = document.getElementById('paramBackgroundColor');
        if (bg && params.backgroundColor) bg.value = params.backgroundColor;
      })
      .catch(function () {});
  }

  document.getElementById('paramsForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!localStorage.getItem('access_token')) return;
    var statusEl = document.getElementById('paramsSaveStatus');
    var body = {
      sceneWidth: parseInt(document.getElementById('paramSceneWidth').value, 10) || undefined,
      sceneHeight: parseInt(document.getElementById('paramSceneHeight').value, 10) || undefined,
      objectSize: parseInt(document.getElementById('paramObjectSize').value, 10) || undefined,
      mapWidth: parseInt(document.getElementById('paramMapWidth').value, 10) || undefined,
      mapHeight: parseInt(document.getElementById('paramMapHeight').value, 10) || undefined,
      maxConcurrentJobs: parseInt(document.getElementById('paramMaxConcurrentJobs').value, 10) || undefined,
      compositeScene: document.getElementById('paramCompositeScene').checked,
      gridCols: parseInt(document.getElementById('paramGridCols').value, 10) || undefined,
      gridRows: parseInt(document.getElementById('paramGridRows').value, 10) || undefined,
      compositeConcurrency: parseInt(document.getElementById('paramCompositeConcurrency').value, 10) || undefined,
      maxGenerationTokens: parseInt(document.getElementById('paramMaxGenerationTokens').value, 10) || undefined,
      maxSvgElements: parseInt(document.getElementById('paramMaxSvgElements').value, 10) || undefined,
      pixelScale: parseInt(document.getElementById('paramPixelScale').value, 10) || undefined,
      outputFormat: document.getElementById('paramOutputFormat').value || undefined,
      quality: parseInt(document.getElementById('paramQuality').value, 10) || undefined,
      backgroundColor: document.getElementById('paramBackgroundColor').value.trim() || undefined,
    };
    Object.keys(body).forEach(function (k) {
      if (body[k] === undefined || body[k] === '') delete body[k];
    });
    statusEl.textContent = 'Сохранение…';
    fetch('/generation-params', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) throw new Error('Ошибка');
        statusEl.textContent = 'Сохранено';
        setTimeout(function () { statusEl.textContent = ''; }, 2000);
      })
      .catch(function () {
        statusEl.textContent = 'Ошибка';
      });
  });

  var testForm = document.getElementById('testForm');
  var testLoader = document.getElementById('testLoader');
  var testError = document.getElementById('testError');
  var testResult = document.getElementById('testResult');
  var testResultImage = document.getElementById('testResultImage');
  var testLinkPng = document.getElementById('testLinkPng');
  var testLinkSvg = document.getElementById('testLinkSvg');
  var testSubmitBtn = document.getElementById('testSubmitBtn');

  testForm.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!localStorage.getItem('access_token')) {
      testError.textContent = 'Сначала войдите в систему.';
      testError.classList.remove('hidden');
      return;
    }
    var description = document.getElementById('testDescription').value.trim();
    if (!description) {
      testError.textContent = 'Введите описание.';
      testError.classList.remove('hidden');
      return;
    }
    var type = document.getElementById('testType').value;
    var width = document.getElementById('testWidth').value.trim();
    var height = document.getElementById('testHeight').value.trim();
    var body = { description: description, type: type };
    if (width) body.width = parseInt(width, 10);
    if (height) body.height = parseInt(height, 10);

    testError.classList.add('hidden');
    testResult.classList.add('hidden');
    testLoader.classList.remove('hidden');
    testSubmitBtn.disabled = true;

    fetch('/tasks', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) throw new Error(result.data.message || result.data.error || 'Ошибка сервера');
        var taskId = result.data.taskId;
        if (!taskId) throw new Error('Нет taskId');
        var pollTimer = setInterval(function () {
          fetch('/tasks/' + taskId, { headers: getAuthHeaders() })
            .then(function (res) { return res.json(); })
            .then(function (task) {
              if (task.status === 'completed') {
                clearInterval(pollTimer);
                testLoader.classList.add('hidden');
                testSubmitBtn.disabled = false;
                var pngUrl = task.pngUrl || ('/output/web/' + taskId + '.png');
                var svgUrl = task.svgUrl || ('/output/web/' + taskId + '.svg');
                testResultImage.src = pngUrl;
                testLinkPng.href = pngUrl;
                testLinkPng.download = 'test.png';
                testLinkSvg.href = svgUrl;
                testLinkSvg.download = 'test.svg';
                testResult.classList.remove('hidden');
              } else if (task.status === 'failed') {
                clearInterval(pollTimer);
                testLoader.classList.add('hidden');
                testSubmitBtn.disabled = false;
                testError.textContent = task.error || 'Генерация не удалась.';
                testError.classList.remove('hidden');
              }
            })
            .catch(function () {
              clearInterval(pollTimer);
              testLoader.classList.add('hidden');
              testSubmitBtn.disabled = false;
              testError.textContent = 'Ошибка опроса статуса.';
              testError.classList.remove('hidden');
            });
        }, POLL_INTERVAL_MS);
      })
      .catch(function (err) {
        testLoader.classList.add('hidden');
        testSubmitBtn.disabled = false;
        testError.textContent = err.message || 'Не удалось запустить тест.';
        testError.classList.remove('hidden');
      });
  });

  updateAuthUI();
  if (localStorage.getItem('access_token')) loadLibraryList();
})();
