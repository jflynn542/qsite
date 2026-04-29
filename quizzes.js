const quizCategories = [
  {
    id: "Countries",
    title: "Countries",
    description: ""
  },
  {
    id: "Counties",
    title: "Counties/States",
    description: ""
  },
  {
    id: "Other",
    title: "Other",
    description: ""
  }
];

const quizzes = [
  {
    id: "countiesofalbania",
    categoryId: "Counties",
    title: "Counties Of Albania",
    description: "",
    timeLimit: 300,
    image: "assets/albania-counties.jpg",
    answers: [
    { answer: "Berat", x: 48.3, y: 58, labelSize: 12, dotSize: 10 },
    { answer: "Diber", x: 51.4, y: 28, labelSize: 12, dotSize: 10 },
    { answer: "Durres", x: 39.5, y: 33.8, labelSize: 5, dotSize: 10 },
    { answer: "Elbasan", x: 50.5, y: 43.3, labelSize: 12, dotSize: 10 },
    { answer: "Fier", x: 39.5, y: 54.8, labelSize: 5, dotSize: 10 },
    { answer: "Gjirokaster", x: 50.3, y: 73.2, labelSize: 5, dotSize: 10 },
    { answer: "Korce", x: 59.1, y: 58.2, labelSize: 12, dotSize: 10 },
    { answer: "Kukes", x: 54.4, y: 11.5, labelSize: 12, dotSize: 10 },
    { answer: "Lezhe", x: 43, y: 23.8, labelSize: 5, dotSize: 10 },
    { answer: "Shkoder", x: 38.9, y: 9, labelSize: 12, dotSize: 10 },
    { answer: "Tirane", x: 43.8, y: 41.5, labelSize: 5, dotSize: 10 },
    { answer: "Vlore", x: 37.8, y: 72.7, labelSize: 12, dotSize: 10 }
  ]
  },
  {
    "id": "Countiesofliberia",
    "categoryId": "Counties",
    "title": "Counties of Liberia",
    "description": "",
    "timeLimit": 300,
    "image": "assets/liberia-map.png",
    "answers": [
      {
        "answer": "Lofa",
        "x": 42.3,
        "y": 14.2
      },
      {
        "answer": "Gbarpolu",
        "x": 36.9,
        "y": 25.3
      },
      {
        "answer": "Grand Cape Mount",
        "x": 23.9,
        "y": 30.1
      },
      {
        "answer": "Bomi",
        "x": 26.9,
        "y": 41
      },
      {
        "answer": "Montserrado",
        "x": 32.2,
        "y": 43.4
      },
      {
        "answer": "Bong",
        "x": 47.9,
        "y": 34.9
      },
      {
        "answer": "Margibi",
        "x": 32.2,
        "y": 52.3
      },
      {
        "answer": "Grand Bassa",
        "x": 43.4,
        "y": 49
      },
      {
        "answer": "Nimba",
        "x": 61.7,
        "y": 34.5
      },
      {
        "answer": "River Cess",
        "x": 51.8,
        "y": 56.7
      },
      {
        "answer": "Grand Gedeh",
        "x": 69,
        "y": 54.3
      },
      {
        "answer": "Sinoe",
        "x": 57.5,
        "y": 67.3
      },
      {
        "answer": "River Gee",
        "x": 74.9,
        "y": 69.7
      },
      {
        "answer": "Grand Kru",
        "x": 66.4,
        "y": 78.7
      },
      {
        "answer": "Maryland",
        "x": 77.3,
        "y": 83.3
      }
    ]
  },
  {
    id: "test2",
    categoryId: "Countries",
    type: "table",
    title: "Test2",
    description: "Type as many answers as you can before time runs out.",
    timeLimit: 180,
    image: "",
    answers: [
      { answer: "Dublin", hint: "Ireland" },
      { answer: "Riga", hint: "Latvia" },
      { answer: "London", hint: "England" }
    ]
  }
];

