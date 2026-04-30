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
    tableColumns: 2
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

function normaliseAliases(text) {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderBuilderPage() {
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

  let state = loadBuilderState();
  state.quizType = state.quizType || "map";
  state.defaultLabelSize = state.defaultLabelSize || 12;
  state.defaultDotSize = state.defaultDotSize || 10;
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

        return `  { ${parts.join(", ")} }`;
      })
      .join(",\n")}\n]`;
  }

  function buildQuizObjectExport() {
    const quizId = state.quizId || safeSlug(state.title || "new-quiz");

    const imageLine = state.quizType === "map"
      ? `\n  image: ${formatJsValue(state.imagePath || "assets/your-map.png")},`
      : `\n  image: "",`;

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
    timeLimit: ${Number(state.timeLimit) || 180},${imageLine}${tableColumnsLine}
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
        const dotSize = typeof entry.dotSize === "number" ? entry.dotSize : state.defaultDotSize;

        return `
          <button
            class="builder-marker${index === state.selectedIndex ? " active" : ""}"
            style="left:${entry.x}%; top:${entry.y}%; --builder-label-size:${labelSize}px; --builder-dot-size:${dotSize}px;"
            data-index="${index}"
            type="button"
            title="${entry.answer}"
          >
            <span>${entry.answer}</span>
          </button>
        `;
      })
      .join("");

    markerLayer.querySelectorAll(".builder-marker").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedIndex = Number(button.dataset.index);
        syncUI();
      });
    });
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
        ? `Text ${entry.labelSize || state.defaultLabelSize}px · Dot ${entry.dotSize || state.defaultDotSize}px`
        : `${Math.min(8, Math.max(1, Number(state.tableColumns) || 2))} columns`;

      return `
        <div class="builder-answer-row compact-builder-answer-row${index === state.selectedIndex ? " selected" : ""}" data-index="${index}">
          <div class="builder-answer-main">
            <strong>${entry.answer}</strong>
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
      ? state.answers.map((entry) => `<div class="builder-table-cell">${entry.answer}</div>`).join("")
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
        }
        return cleanEntry;
      })
    };

    if (state.quizType === "table") {
      quiz.tableColumns = Math.min(8, Math.max(1, Number(state.tableColumns) || 2));
    }

    return quiz;
  }

  async function saveCreatedQuiz() {
    const quiz = getQuizObject();

    if (!quiz.id || !quiz.answers.length) {
      window.alert("Add a quiz title/id and at least one answer before creating the quiz.");
      return;
    }

    const { auth, db } = await import("./js/firebase-config.js");

    const {
      doc,
      setDoc,
      serverTimestamp
    } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");

    const user = auth.currentUser;

    if (!user) {
      window.alert("You must be signed in to create and upload quizzes.");
      return;
    }

    const onlineQuiz = {
      ...quiz,
      createdBy: user.uid,
      createdByName: user.displayName || "Unknown user",
      createdByEmail: user.email || "",
      createdAt: serverTimestamp()
    };

    await setDoc(doc(db, "sharedQuizzes", quiz.id), onlineQuiz);

    window.alert("Quiz uploaded online. Other users can now access it.");
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
        const [answerPart, hintPart = ""] = line.split("|");
        addAnswer(answerPart.trim(), [], hintPart.trim());
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
    if (event.target.closest(".builder-marker")) return;
    if (state.selectedIndex < 0 || !state.answers[state.selectedIndex]) return;
    if (!state.imagePreview) return;

    const rect = mapInner.getBoundingClientRect();
    const x = Number((((event.clientX - rect.left) / rect.width) * 100).toFixed(1));
    const y = Number((((event.clientY - rect.top) / rect.height) * 100).toFixed(1));

    state.answers[state.selectedIndex].x = x;
    state.answers[state.selectedIndex].y = y;
    state.answers[state.selectedIndex].labelSize = state.defaultLabelSize || 12;
    state.answers[state.selectedIndex].dotSize = state.defaultDotSize || 10;

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
    state.tableColumns = 2;
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
