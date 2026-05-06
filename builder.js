const BUILDER_STORAGE_KEY = "quizHubBuilderDraft";
const CUSTOM_QUIZZES_STORAGE_KEY = "quizHubCustomQuizzes";

function safeSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultBuilderState() {
  return {
    quizId: "",
    categoryId: (typeof quizCategories !== "undefined" && quizCategories[0] && quizCategories[0].id) || "templates",
    title: "",
    description: "",
    timeLimit: 180,
    quizType: "map",
    imagePath: "",
    imagePreview: "",
    answers: [],
    selectedIndex: -1,
    defaultLabelSize: 12,
    defaultDotSize: 10,
    defaultPlaceholderSize: 18,
    tableColumns: 2,
    editingQuizId: "",
    editingSource: ""
  };
}

function loadBuilderState() {
  const raw = localStorage.getItem(BUILDER_STORAGE_KEY);
  if (!raw) return defaultBuilderState();
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultBuilderState(),
      ...parsed,
      answers: Array.isArray(parsed.answers) ? parsed.answers : []
    };
  } catch {
    return defaultBuilderState();
  }
}

function saveBuilderState(state) {
  localStorage.setItem(BUILDER_STORAGE_KEY, JSON.stringify(state));
}

async function getSharedQuizForEditing(quizId) {
  const { db } = await import("./js/firebase-config.js");
  const { doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

  const quizSnap = await getDoc(doc(db, "sharedQuizzes", quizId));
  if (!quizSnap.exists()) return null;
  return { ...quizSnap.data(), id: quizSnap.id };
}

function getLocalQuizForEditing(quizId) {
  try {
    const customQuizzes = JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_STORAGE_KEY) || "[]");
    if (Array.isArray(customQuizzes)) {
      const customQuiz = customQuizzes.find((quiz) => quiz.id === quizId);
      if (customQuiz) return { ...customQuiz, source: "local" };
    }
  } catch {
    // Ignore broken localStorage data.
  }

  if (typeof quizzes !== "undefined") {
    const builtInQuiz = quizzes.find((quiz) => quiz.id === quizId);
    if (builtInQuiz) return { ...builtInQuiz, source: "built-in" };
  }

  return null;
}

function quizToBuilderState(quiz, source = "shared") {
  const quizType = quiz.type || quiz.quizType || "map";

  return {
    ...defaultBuilderState(),
    quizId: quiz.id || "",
    categoryId: quiz.categoryId || "Other",
    title: quiz.title || "",
    description: quiz.description || "",
    timeLimit: Number(quiz.timeLimit) || 180,
    quizType,
    imagePath: quiz.image || quiz.imagePath || "",
    imagePreview: quiz.image || quiz.imagePath || "",
    answers: Array.isArray(quiz.answers) ? JSON.parse(JSON.stringify(quiz.answers)) : [],
    selectedIndex: 0,
    defaultLabelSize: 12,
    defaultDotSize: 10,
    defaultPlaceholderSize: Number(quiz.placeholderSize) || 18,
    tableColumns: Math.min(8, Math.max(1, Number(quiz.tableColumns) || 2)),
    editingQuizId: quiz.id || "",
    editingSource: source
  };
}

async function loadQuizFromEditUrl() {
  const params = new URLSearchParams(window.location.search);
  const editId = params.get("edit");
  if (!editId) return null;

  const localQuiz = getLocalQuizForEditing(editId);
  if (localQuiz) return quizToBuilderState(localQuiz, localQuiz.source || "local");

  const sharedQuiz = await getSharedQuizForEditing(editId);
  if (sharedQuiz) return quizToBuilderState(sharedQuiz, "shared");

  window.alert("Could not find that quiz to edit.");
  return null;
}

function normaliseAliases(text) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function renderBuilderPage() {
  const page = document.body.dataset.page;
  if (page !== "builder") return;

  const quizTypeSelect = document.getElementById("builderQuizType");
  const quizIdInput = document.getElementById("builderQuizId");
  const categorySelect = document.getElementById("builderCategoryId");
  const titleInput = document.getElementById("builderQuizTitle");
  const descriptionInput = document.getElementById("builderQuizDescription");
  const timeLimitInput = document.getElementById("builderTimeLimit");
  const imagePathInput = document.getElementById("builderImagePath");
  const imageUploadInput = document.getElementById("builderImageUpload");
  const tableColumnsInput = document.getElementById("builderTableColumns");
  const tableColumnsField = document.getElementById("tableColumnsField");
  const bulkAnswersInput = document.getElementById("bulkAnswersInput");
  const answerSelect = document.getElementById("answerSelect");
  const labelSizeInput = document.getElementById("labelSizeInput");
  const dotSizeInput = document.getElementById("dotSizeInput");
  const placeholderSizeInput = document.getElementById("placeholderSizeInput");
  const answerList = document.getElementById("builderAnswerList");
  const placedCount = document.getElementById("placedCount");
  const answerCount = document.getElementById("answerCount");
  const mapInner = document.getElementById("builderMapInner");
  const mapImage = document.getElementById("builderMapImage");
  const markerLayer = document.getElementById("builderMarkerLayer");
  const mapEmpty = document.getElementById("builderMapEmpty");
  const answersExport = document.getElementById("answersExport");
  const quizExport = document.getElementById("quizExport");
  const selectedAnswerHint = document.getElementById("selectedAnswerHint");
  const mapImageSection = document.getElementById("mapImageSection");
  const builderMapPanel = document.getElementById("builderMapPanel");
  const builderTablePreview = document.getElementById("builderTablePreview");
  const createQuizBtn = document.getElementById("createQuizBtn");
  const builderModeText = document.getElementById("builderModeText");

  let state = loadBuilderState();

  const editState = await loadQuizFromEditUrl();
  if (editState) {
    state = editState;
    saveBuilderState(state);
  }

  state.quizType = state.quizType || "map";
  state.defaultLabelSize = state.defaultLabelSize || 12;
  state.defaultDotSize = state.defaultDotSize || 10;
  state.defaultPlaceholderSize = state.defaultPlaceholderSize || 18;
  state.tableColumns = Math.min(8, Math.max(1, Number(state.tableColumns) || 2));

  function ensureSelectedIndex() {
    if (!state.answers.length) {
      state.selectedIndex = -1;
      return;
    }
    if (state.selectedIndex < 0 || state.selectedIndex >= state.answers.length) {
      state.selectedIndex = 0;
    }
  }

  function populateCategories() {
    categorySelect.innerHTML = quizCategories.map((category) => `
      <option value="${category.id}">${category.title}</option>
    `).join("");
  }

  function formatJsValue(value) {
    if (Array.isArray(value)) {
      return `[${value.map((item) => formatJsValue(item)).join(", ")}]`;
    }

    if (typeof value === "string") {
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    return String(value);
  }

  function buildAnswersExport() {
    if (!state.answers.length) return "[]";

    return `[\n${state.answers
      .map((entry) => {
        const parts = [`answer: ${formatJsValue(entry.answer)}`];

        if (entry.aliases && entry.aliases.length) {
          parts.push(`aliases: ${formatJsValue(entry.aliases)}`);
        }

        if (entry.hint) {
          parts.push(`hint: ${formatJsValue(entry.hint)}`);
        }

        if (state.quizType === "map" && typeof entry.x === "number") {
          parts.push(`x: ${entry.x}`);
        }

        if (state.quizType === "map" && typeof entry.y === "number") {
          parts.push(`y: ${entry.y}`);
        }

        if (state.quizType === "map" && typeof entry.labelSize === "number") {
          parts.push(`labelSize: ${entry.labelSize}`);
        }

        if (state.quizType === "map" && typeof entry.dotSize === "number") {
          parts.push(`dotSize: ${entry.dotSize}`);
        }

        if (state.quizType === "map" && typeof entry.placeholderSize === "number") {
          parts.push(`placeholderSize: ${entry.placeholderSize}`);
        }

        return `  { ${parts.join(", ")} }`;
      })
      .join(",\n")}\n]`;
  }

  function buildQuizObjectExport() {
    const quizId = state.quizId || safeSlug(state.title || "new-quiz");

    const imageLine = state.quizType === "map"
      ? `\n  image: ${formatJsValue(state.imagePath || "assets/your-map.png")},`
      : `\n  image: "",`;

    const placeholderLine = state.quizType === "map"
      ? `\n  placeholderImage: "assets/placeholder.png",\n  placeholderSize: ${Number(state.defaultPlaceholderSize) || 18},`
      : "";

    const tableColumnsLine = state.quizType === "table"
      ? `\n  tableColumns: ${Math.min(8, Math.max(1, Number(state.tableColumns) || 2))},`
      : "";

    return `{
    id: ${formatJsValue(quizId)},
    categoryId: ${formatJsValue(state.categoryId || "templates")},
    type: ${formatJsValue(state.quizType || "map")},
    title: ${formatJsValue(state.title || "New Quiz")},
    description: ${formatJsValue(
      state.description || "Type as many answers as you can before time runs out."
    )},
    timeLimit: ${Number(state.timeLimit) || 180},${imageLine}${placeholderLine}${tableColumnsLine}
    answers: ${buildAnswersExport().replace(/\n/g, "\n  ").trimStart()}
  }`;
  }

  function renderMarkers() {
    if (state.quizType !== "map") {
      markerLayer.innerHTML = "";
      return;
    }

    markerLayer.innerHTML = state.answers
      .filter((entry) => typeof entry.x === "number" && typeof entry.y === "number")
      .map((entry, index) => {
        const labelSize = typeof entry.labelSize === "number" ? entry.labelSize : state.defaultLabelSize;

        return `
          <span
            class="builder-marker${index === state.selectedIndex ? " active" : ""}"
            style="left:${entry.x}%; top:${entry.y}%; --builder-label-size:${labelSize}px;"
            title="${entry.answer}"
          >${entry.answer}</span>
        `;
      })
      .join("");
  }

  function renderAnswerSelect() {
    ensureSelectedIndex();
    answerSelect.innerHTML = state.answers.length
      ? state.answers.map((entry, index) => {
          const placed = typeof entry.x === "number" && typeof entry.y === "number";
          const status = state.quizType === "map" ? (placed ? "✓" : "○") : "•";
          return `<option value="${index}">${status} ${entry.answer}</option>`;
        }).join("")
      : '<option value="">No answers yet</option>';

    if (state.selectedIndex >= 0) {
      answerSelect.value = String(state.selectedIndex);
    }
  }

  function renderAnswerList() {
    if (!state.answers.length) {
      answerList.innerHTML = '<div class="empty-state">No answers added yet.</div>';
      return;
    }

    answerList.innerHTML = state.answers.map((entry, index) => {
      const placed = typeof entry.x === "number" && typeof entry.y === "number";
      const firstPill = state.quizType === "map"
        ? (placed ? `${entry.x}% , ${entry.y}%` : "Unplaced")
        : "Table answer";

      const secondPill = state.quizType === "map"
        ? `Text ${entry.labelSize || state.defaultLabelSize}px · Placeholder ${entry.placeholderSize || state.defaultPlaceholderSize}px`
        : `${Math.min(8, Math.max(1, Number(state.tableColumns) || 2))} columns`;

      return `
        <div class="builder-answer-row compact-builder-answer-row${index === state.selectedIndex ? " selected" : ""}" data-index="${index}">
          <div class="builder-answer-main">
            <strong>${entry.answer}</strong>
            ${entry.hint ? `<span>Hint: ${entry.hint}</span>` : ""}
          </div>
          <div class="builder-answer-meta compact-answer-meta">
            <span class="meta-pill">${firstPill}</span>
            <span class="meta-pill">${secondPill}</span>
            <button class="ghost-button small-button remove-answer-btn" data-index="${index}" type="button">Remove</button>
          </div>
        </div>
      `;
    }).join("");

    answerList.querySelectorAll(".builder-answer-row").forEach((row) => {
      row.addEventListener("click", (event) => {
        if (event.target.closest("button")) return;
        state.selectedIndex = Number(row.dataset.index);
        syncUI();
      });
    });


    answerList.querySelectorAll(".remove-answer-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.index);
        state.answers.splice(index, 1);
        if (state.selectedIndex >= state.answers.length) {
          state.selectedIndex = state.answers.length - 1;
        }
        syncUI();
      });
    });
  }


  function renderTablePreview() {
    if (!builderTablePreview) return;
    const columns = Math.min(8, Math.max(1, Number(state.tableColumns) || 2));
    builderTablePreview.style.setProperty("--builder-table-columns", columns);

    if (state.quizType !== "table") {
      builderTablePreview.classList.add("hidden");
      return;
    }

    builderTablePreview.classList.remove("hidden");
    builderTablePreview.innerHTML = state.answers.length
      ? state.answers.map((entry) => `
          <div class="builder-table-hint-cell">${entry.hint || ""}</div>
          <div class="builder-table-cell">${entry.answer}</div>
        `).join("")
      : `<div class="builder-table-empty">Add answers to preview the table.</div>`;
  }

  function getQuizObject() {
    const quizId = state.quizId || safeSlug(state.title || "new-quiz");
    const quiz = {
      id: quizId,
      categoryId: state.categoryId || "Other",
      type: state.quizType || "map",
      title: state.title || "New Quiz",
      description: state.description || "Type as many answers as you can before time runs out.",
      timeLimit: Number(state.timeLimit) || 180,
      image: state.quizType === "map" ? (state.imagePath || "assets/your-map.png") : "",
      answers: state.answers.map((entry) => {
        const cleanEntry = { answer: entry.answer };
        if (entry.aliases && entry.aliases.length) cleanEntry.aliases = entry.aliases;
        if (entry.hint) cleanEntry.hint = entry.hint;
        if (state.quizType === "map") {
          if (typeof entry.x === "number") cleanEntry.x = entry.x;
          if (typeof entry.y === "number") cleanEntry.y = entry.y;
          cleanEntry.labelSize = typeof entry.labelSize === "number" ? entry.labelSize : state.defaultLabelSize;
          cleanEntry.dotSize = typeof entry.dotSize === "number" ? entry.dotSize : state.defaultDotSize;
          cleanEntry.placeholderSize = typeof entry.placeholderSize === "number" ? entry.placeholderSize : state.defaultPlaceholderSize;
        }
        return cleanEntry;
      })
    };

    if (state.quizType === "map") {
      quiz.placeholderImage = "assets/placeholder.png";
      quiz.placeholderSize = Number(state.defaultPlaceholderSize) || 18;
    }

    if (state.quizType === "table") {
      quiz.tableColumns = Math.min(8, Math.max(1, Number(state.tableColumns) || 2));
    }

    return quiz;
  }

  async function saveCreatedQuiz() {
    const quiz = getQuizObject();

    if (!quiz.id || !quiz.answers.length) {
      window.alert("Add a quiz title/id and at least one answer before saving the quiz.");
      return;
    }

    if (state.editingSource === "built-in") {
      const customQuizzes = JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_STORAGE_KEY) || "[]");
      const updatedQuiz = { ...quiz, id: state.editingQuizId || quiz.id, editedFromBuiltIn: true };
      const existingIndex = customQuizzes.findIndex((item) => item.id === updatedQuiz.id);
      if (existingIndex >= 0) {
        customQuizzes[existingIndex] = updatedQuiz;
      } else {
        customQuizzes.push(updatedQuiz);
      }
      localStorage.setItem(CUSTOM_QUIZZES_STORAGE_KEY, JSON.stringify(customQuizzes));
      window.alert("Built-in quiz edited as a local custom copy.");
      window.location.href = "add-quizzes.html";
      return;
    }

    if (state.editingSource === "local") {
      const customQuizzes = JSON.parse(localStorage.getItem(CUSTOM_QUIZZES_STORAGE_KEY) || "[]");
      const originalId = state.editingQuizId || quiz.id;
      const updatedQuiz = { ...quiz, id: originalId };
      const existingIndex = customQuizzes.findIndex((item) => item.id === originalId);

      if (existingIndex >= 0) {
        customQuizzes[existingIndex] = updatedQuiz;
      } else {
        customQuizzes.push(updatedQuiz);
      }

      localStorage.setItem(CUSTOM_QUIZZES_STORAGE_KEY, JSON.stringify(customQuizzes));
      window.alert("Quiz updated locally.");
      window.location.href = "add-quizzes.html";
      return;
    }

    const { auth, db } = await import("./js/firebase-config.js");

    const {
      doc,
      getDoc,
      setDoc,
      serverTimestamp
    } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    const user = auth.currentUser;

    if (!user) {
      window.alert("You must be signed in to create and upload quizzes.");
      return;
    }

    const originalId = state.editingQuizId || quiz.id;
    const quizRef = doc(db, "sharedQuizzes", originalId);
    const existingSnap = await getDoc(quizRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : null;

    if (existingData && existingData.createdBy && existingData.createdBy !== user.uid) {
      window.alert("You can only edit quizzes that were uploaded by your own account.");
      return;
    }

    const onlineQuiz = {
      ...quiz,
      id: originalId,
      createdBy: existingData?.createdBy || user.uid,
      createdByName: existingData?.createdByName || user.displayName || "Unknown user",
      createdByEmail: existingData?.createdByEmail || user.email || "",
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    };

    await setDoc(quizRef, onlineQuiz, { merge: true });

    window.alert(state.editingQuizId ? "Quiz updated online." : "Quiz uploaded online. Other users can now access it.");
    window.location.href = "add-quizzes.html";
  }

  function syncUI() {
    ensureSelectedIndex();

    quizTypeSelect.value = state.quizType || "map";
    quizIdInput.value = state.quizId;
    categorySelect.value = state.categoryId;
    titleInput.value = state.title;
    descriptionInput.value = state.description;
    timeLimitInput.value = state.timeLimit;
    imagePathInput.value = state.imagePath;
    if (tableColumnsInput) tableColumnsInput.value = Math.min(8, Math.max(1, Number(state.tableColumns) || 2));
    labelSizeInput.value = state.defaultLabelSize || 12;
    dotSizeInput.value = state.defaultDotSize || 10;
    if (placeholderSizeInput) placeholderSizeInput.value = state.defaultPlaceholderSize || 18;

    const isTableQuiz = state.quizType === "table";
    if (mapImageSection) mapImageSection.classList.toggle("builder-map-disabled", isTableQuiz);
    if (builderMapPanel) builderMapPanel.classList.toggle("table-preview-mode", isTableQuiz);
    if (tableColumnsField) tableColumnsField.classList.toggle("hidden", !isTableQuiz);
    imagePathInput.disabled = isTableQuiz;
    imageUploadInput.disabled = isTableQuiz;

    mapImage.src = state.imagePreview || "";
    mapImage.style.display = state.imagePreview && !isTableQuiz ? "block" : "none";
    mapInner.classList.toggle("hidden", isTableQuiz);
    mapEmpty.style.display = state.imagePreview || isTableQuiz ? "none" : "grid";

    answerCount.textContent = state.answers.length;
    placedCount.textContent = state.quizType === "map"
      ? state.answers.filter((entry) => typeof entry.x === "number" && typeof entry.y === "number").length
      : state.answers.length;

    renderAnswerSelect();
    renderAnswerList();
    renderMarkers();
    renderTablePreview();

    if (state.quizType === "table") {
      selectedAnswerHint.textContent = "Table quiz selected. Add answers and choose how many columns to preview.";
    } else if (state.selectedIndex >= 0 && state.answers[state.selectedIndex]) {
      const selected = state.answers[state.selectedIndex];
      selectedAnswerHint.textContent = `Selected: ${selected.answer}. Click the map to place or move it.`;
    } else {
      selectedAnswerHint.textContent = "Select an answer, then click the map.";
    }

    answersExport.value = buildAnswersExport();
    quizExport.value = buildQuizObjectExport();
    if (builderModeText) {
      if (state.editingQuizId) {
        builderModeText.textContent = state.editingSource === "built-in"
          ? "Editing a built-in quiz. This will save as a custom copy."
          : `Editing: ${state.title || state.editingQuizId}`;
      } else {
        builderModeText.textContent = "Saves the quiz into Add Quizzes automatically.";
      }
    }

    if (createQuizBtn) {
      createQuizBtn.textContent = state.editingQuizId ? "Save changes" : "Create quiz";
    }

    saveBuilderState(state);
  }

  function addAnswer(answer, aliases = [], hint = "") {
    const trimmed = answer.trim();
    if (!trimmed) return;
    const exists = state.answers.some((entry) => entry.answer.toLowerCase() === trimmed.toLowerCase());
    if (exists) return;

    const entry = {
      answer: trimmed,
      aliases,
      hint: hint.trim()
    };

    if (state.quizType === "map") {
      entry.labelSize = state.defaultLabelSize || 12;
      entry.dotSize = state.defaultDotSize || 10;
      entry.placeholderSize = state.defaultPlaceholderSize || 18;
    }

    state.answers.push(entry);

    if (!state.quizId && state.title) {
      state.quizId = safeSlug(state.title);
    }

    if (state.selectedIndex === -1) {
      state.selectedIndex = state.answers.length - 1;
    }
  }

  function copyText(text) {
    navigator.clipboard.writeText(text);
  }

  populateCategories();
  syncUI();

  quizTypeSelect.addEventListener("change", () => {
    state.quizType = quizTypeSelect.value;
    syncUI();
  });

  [quizIdInput, titleInput, descriptionInput, imagePathInput].forEach((input) => {
    input.addEventListener("input", () => {
      state.quizId = quizIdInput.value.trim();
      state.title = titleInput.value.trim();
      state.description = descriptionInput.value.trim();
      state.imagePath = imagePathInput.value.trim();
      if (!state.quizId && state.title) {
        state.quizId = safeSlug(state.title);
      }
      syncUI();
    });
  });

  categorySelect.addEventListener("change", () => {
    state.categoryId = categorySelect.value;
    syncUI();
  });

  if (tableColumnsInput) {
    tableColumnsInput.addEventListener("input", () => {
      state.tableColumns = Math.min(8, Math.max(1, Number(tableColumnsInput.value) || 2));
      syncUI();
    });
  }

  labelSizeInput.addEventListener("input", () => {
    const value = Number(labelSizeInput.value) || 12;
    state.defaultLabelSize = value;

    if (state.selectedIndex >= 0 && state.answers[state.selectedIndex]) {
      state.answers[state.selectedIndex].labelSize = value;
    }

    syncUI();
  });

  dotSizeInput.addEventListener("input", () => {
    const value = Number(dotSizeInput.value) || 10;
    state.defaultDotSize = value;

    if (state.selectedIndex >= 0 && state.answers[state.selectedIndex]) {
      state.answers[state.selectedIndex].dotSize = value;
    }

    syncUI();
  });

  if (placeholderSizeInput) {
    placeholderSizeInput.addEventListener("input", () => {
      const value = Number(placeholderSizeInput.value) || 18;
      state.defaultPlaceholderSize = value;

      if (state.selectedIndex >= 0 && state.answers[state.selectedIndex]) {
        state.answers[state.selectedIndex].placeholderSize = value;
      }

      syncUI();
    });
  }

  timeLimitInput.addEventListener("input", () => {
    state.timeLimit = Number(timeLimitInput.value) || 180;
    syncUI();
  });

  imageUploadInput.addEventListener("change", () => {
    const file = imageUploadInput.files && imageUploadInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.imagePreview = reader.result;
      syncUI();
    };
    reader.readAsDataURL(file);
  });

  const addBulkAnswersBtn = document.getElementById("addBulkAnswersBtn");
  if (addBulkAnswersBtn && bulkAnswersInput) {
    addBulkAnswersBtn.addEventListener("click", (event) => {
      event.preventDefault();

      const lines = bulkAnswersInput.value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

      lines.forEach((line) => {
        const [answerPart, aliasPart = "", hintPart = ""] = line.split("|");
        addAnswer(
          answerPart.trim(),
          normaliseAliases(aliasPart),
          hintPart.trim()
        );
      });

      if (lines.length) {
        bulkAnswersInput.value = "";
      }

      saveBuilderState(state);
      syncUI();
    });
  }

  answerSelect.addEventListener("change", () => {
    state.selectedIndex = Number(answerSelect.value);
    syncUI();
  });

  document.getElementById("selectNextUnplacedBtn").addEventListener("click", () => {
    const nextIndex = state.answers.findIndex((entry) => typeof entry.x !== "number" || typeof entry.y !== "number");
    state.selectedIndex = nextIndex >= 0 ? nextIndex : (state.answers.length ? 0 : -1);
    syncUI();
  });

  mapInner.addEventListener("click", (event) => {
    if (state.quizType !== "map") return;
    if (state.selectedIndex < 0 || !state.answers[state.selectedIndex]) return;
    if (!state.imagePreview) return;

    const rect = mapImage.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const rawX = ((event.clientX - rect.left) / rect.width) * 100;
    const rawY = ((event.clientY - rect.top) / rect.height) * 100;
    const x = Number(Math.min(100, Math.max(0, rawX)).toFixed(2));
    const y = Number(Math.min(100, Math.max(0, rawY)).toFixed(2));

    state.answers[state.selectedIndex].x = x;
    state.answers[state.selectedIndex].y = y;
    state.answers[state.selectedIndex].labelSize = state.defaultLabelSize || 12;
    state.answers[state.selectedIndex].dotSize = state.defaultDotSize || 10;
    state.answers[state.selectedIndex].placeholderSize = state.defaultPlaceholderSize || 18;

    const nextIndex = state.answers.findIndex(
      (entry) => typeof entry.x !== "number" || typeof entry.y !== "number"
    );

    if (nextIndex >= 0) {
      state.selectedIndex = nextIndex;
    }

    syncUI();
  });

  document.getElementById("removePlacementBtn").addEventListener("click", () => {
    if (state.selectedIndex < 0 || !state.answers[state.selectedIndex]) return;
    delete state.answers[state.selectedIndex].x;
    delete state.answers[state.selectedIndex].y;
    syncUI();
  });

  document.getElementById("clearAllAnswersBtn").addEventListener("click", () => {
    state.answers = [];
    state.selectedIndex = -1;
    syncUI();
  });

  document.getElementById("resetBuilderBtn").addEventListener("click", () => {
    state = defaultBuilderState();
    state.quizType = "map";
    state.defaultLabelSize = 12;
    state.defaultDotSize = 10;
    state.defaultPlaceholderSize = 18;
    state.tableColumns = 2;
    state.editingQuizId = "";
    state.editingSource = "";
    window.history.replaceState({}, "", "builder.html");
    syncUI();
  });

  document.getElementById("saveBuilderDraftBtn").addEventListener("click", () => {
    saveBuilderState(state);
  });

  document.getElementById("copyAnswersBtn").addEventListener("click", () => {
    copyText(answersExport.value);
  });

  if (createQuizBtn) {
    createQuizBtn.addEventListener("click", saveCreatedQuiz);
  }

  document.getElementById("copyQuizBtn").addEventListener("click", () => {
    copyText(quizExport.value);
  });
}

renderBuilderPage();
