package com.fundmonitor.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import java.io.*;
import java.net.*;

/**
 * WebView-based APK with native Referer injection.
 * 
 * Problem: Browsers block custom Referer headers via fetch().
 * Solution: Override shouldInterceptRequest() to re-issue requests
 *           with native HttpURLConnection, which can set any header.
 * 
 * Targeted APIs:
 *   - api.fund.eastmoney.com/f10/lsjz  → Referer: fundf10.eastmoney.com
 *   - fundgz.1234567.com.cn            → Referer: fund.eastmoney.com
 *   - push2.eastmoney.com              → Referer: quote.eastmoney.com
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        WebView webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(true);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                String referer = null;

                if (url.contains("api.fund.eastmoney.com/f10/lsjz")) {
                    referer = "https://fundf10.eastmoney.com/";
                } else if (url.contains("push2.eastmoney.com")) {
                    referer = "https://quote.eastmoney.com/";
                } else if (url.contains("fundgz.1234567.com.cn")) {
                    referer = "https://fund.eastmoney.com/";
                }

                if (referer != null) {
                    try {
                        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
                        conn.setRequestMethod(request.getMethod());
                        conn.setConnectTimeout(8000);
                        conn.setReadTimeout(8000);
                        conn.setRequestProperty("Referer", referer);
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0");

                        for (java.util.Map.Entry<String, String> h : request.getRequestHeaders().entrySet()) {
                            String key = h.getKey();
                            if (key.equalsIgnoreCase("Referer") ||
                                key.equalsIgnoreCase("User-Agent") ||
                                key.equalsIgnoreCase("Origin")) continue;
                            conn.setRequestProperty(key, h.getValue());
                        }

                        conn.connect();
                        int code = conn.getResponseCode();
                        String mime = conn.getContentType();
                        if (mime == null) mime = "text/plain";
                        String encoding = conn.getContentEncoding();
                        if (encoding == null) encoding = "UTF-8";

                        InputStream stream = (code >= 200 && code < 300)
                            ? conn.getInputStream() : conn.getErrorStream();
                        if (stream == null) return null;

                        return new WebResourceResponse(
                            mime.split(";")[0].trim(), encoding, stream);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }

                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.setWebChromeClient(new WebChromeClient());
        webView.loadUrl("file:///android_asset/index.html");
        setContentView(webView);
    }
}
