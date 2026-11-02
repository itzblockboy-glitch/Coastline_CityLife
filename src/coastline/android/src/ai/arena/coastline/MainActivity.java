package ai.arena.coastline;
import android.Manifest;
import android.app.*;
import android.os.Bundle;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import java.io.*;
import java.util.*;
public class MainActivity extends Activity {
 private WebView web; private PermissionRequest pending; private static final String HOST="appassets.androidplatform.net";
 @Override public void onCreate(Bundle b){super.onCreate(b);getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);immersive();web=new WebView(this);web.setBackgroundColor(0xff102e32);setContentView(web);
 WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setMediaPlaybackRequiresUserGesture(true);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setSupportMultipleWindows(false);s.setCacheMode(WebSettings.LOAD_NO_CACHE);
 web.setWebViewClient(new WebViewClient(){
 @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){Uri u=r.getUrl();if(!HOST.equals(u.getHost()))return null;String path=u.getPath();if(path==null||path.equals("/"))path="/index.html";if(path.contains("..")||!"https".equals(u.getScheme()))return error();try{String mime=path.endsWith(".html")?"text/html":path.endsWith(".js")?"text/javascript":path.endsWith(".css")?"text/css":path.endsWith(".png")?"image/png":path.endsWith(".jpg")||path.endsWith(".jpeg")?"image/jpeg":path.endsWith(".webp")?"image/webp":path.endsWith(".json")?"application/json":"application/octet-stream";Map<String,String> h=new HashMap<>();h.put("Cache-Control","no-cache");h.put("X-Content-Type-Options","nosniff");return new WebResourceResponse(mime,"UTF-8",200,"OK",h,getAssets().open("www"+path));}catch(Exception e){return error();}}
 @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){Uri u=r.getUrl();if(HOST.equals(u.getHost())&&"https".equals(u.getScheme()))return false;if("https".equals(u.getScheme())){try{startActivity(new Intent(Intent.ACTION_VIEW,u));}catch(Exception e){}}return true;}
 });
 web.setWebChromeClient(new WebChromeClient(){
 @Override public void onPermissionRequest(PermissionRequest r){runOnUiThread(()->{boolean audio=Arrays.asList(r.getResources()).contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE);if(!audio||!HOST.equals(r.getOrigin().getHost())){r.deny();return;}if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)r.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else{if(pending!=null)pending.deny();pending=r;requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},14);}});}
 @Override public void onPermissionRequestCanceled(PermissionRequest r){if(pending==r)pending=null;}
 @Override public boolean onJsAlert(WebView v,String u,String m,JsResult r){new AlertDialog.Builder(MainActivity.this).setMessage(m).setPositiveButton("OK",(d,w)->r.confirm()).setOnCancelListener(d->r.cancel()).show();return true;}
 @Override public boolean onJsPrompt(WebView v,String u,String m,String val,JsPromptResult r){android.widget.EditText input=new android.widget.EditText(MainActivity.this);input.setText(val);new AlertDialog.Builder(MainActivity.this).setMessage(m).setView(input).setPositiveButton("OK",(d,w)->r.confirm(input.getText().toString())).setNegativeButton("Cancel",(d,w)->r.cancel()).setOnCancelListener(d->r.cancel()).show();return true;}
 });web.loadUrl("https://"+HOST+"/index.html?v=6");}
 private WebResourceResponse error(){return new WebResourceResponse("text/plain","UTF-8",404,"Not found",new HashMap<>(),new ByteArrayInputStream("Not found".getBytes()));}
 @Override public void onRequestPermissionsResult(int c,String[] p,int[] g){super.onRequestPermissionsResult(c,p,g);if(c==14&&pending!=null){if(g.length>0&&g[0]==PackageManager.PERMISSION_GRANTED)pending.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});else pending.deny();pending=null;}}
 private void immersive(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN|View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION|View.SYSTEM_UI_FLAG_LAYOUT_STABLE);}
 @Override public void onWindowFocusChanged(boolean f){super.onWindowFocusChanged(f);if(f)immersive();}
 @Override protected void onPause(){if(web!=null){web.evaluateJavascript("document.dispatchEvent(new Event('coastlinepause'))",null);web.onPause();}super.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null){web.onResume();web.evaluateJavascript("document.dispatchEvent(new Event('coastlineresume'))",null);}immersive();}
 @Override public void onBackPressed(){if(web.canGoBack()){web.goBack();return;}web.evaluateJavascript("(function(){let o=document.querySelector('.overlay.open');if(o){o.classList.remove('open');return true}return false})()",v->{if(!"true".equals(v))new AlertDialog.Builder(this).setTitle("Leave the coast?").setMessage("Your room will disconnect.").setPositiveButton("Exit",(d,w)->finish()).setNegativeButton("Keep playing",(d,w)->immersive()).show();});}
 @Override protected void onDestroy(){if(pending!=null)pending.deny();if(web!=null){web.destroy();web=null;}super.onDestroy();}
}
