module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      url: [
        "http://127.0.0.1:8787/",
        "http://127.0.0.1:8787/pdf",
        "http://127.0.0.1:8787/pdf-tools",
        "http://127.0.0.1:8787/pdf/edit",
      ],
      settings: {
        formFactor: "mobile",
        throttlingMethod: "simulate",
        chromeFlags:
          "--headless --no-sandbox --disable-dev-shm-usage --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows",
        screenEmulation: {
          mobile: true,
          width: 390,
          height: 844,
          deviceScaleFactor: 3,
          disabled: false,
        },
        onlyCategories: [
          "performance",
          "accessibility",
          "best-practices",
          "seo",
        ],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.65 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 4000 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-blocking-time": ["error", { maxNumericValue: 600 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci",
      reportFilenamePattern: "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%",
    },
  },
};
