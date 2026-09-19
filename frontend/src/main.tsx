import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import ErrorBoundary from "./components/feedback/ErrorBoundary";
import FeedbackProvider from "./components/feedback/FeedbackProvider";
import LanguageSync from "./app/LanguageSync";
import ThemeModeProvider from "./app/ThemeModeProvider";
import { store } from "./app/store";
import "./i18n";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeModeProvider>
        <LanguageSync />
        <FeedbackProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </BrowserRouter>
        </FeedbackProvider>
      </ThemeModeProvider>
    </Provider>
  </React.StrictMode>
);
