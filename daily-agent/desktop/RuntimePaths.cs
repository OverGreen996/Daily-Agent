using System;
using System.IO;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace DailyPet {
  static class RuntimePaths {
    public static string Get(string projectRoot, params string[] parts) {
      string root=Path.GetFullPath(projectRoot).TrimEnd(Path.DirectorySeparatorChar);
      var parent=Directory.GetParent(root);
      string runtime=Path.Combine(root,".daily-runtime");
      if(parent!=null&&String.Equals(parent.Name,"releases",StringComparison.OrdinalIgnoreCase)) {
        string install=parent.Parent.FullName;
        var marker=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(File.ReadAllText(Path.Combine(install,".daily-install.json")));
        object kind, recordedRoot, physicalRoot;
        bool matches=marker!=null&&marker.TryGetValue("root",out recordedRoot)&&String.Equals(Path.GetFullPath(Convert.ToString(recordedRoot)).TrimEnd(Path.DirectorySeparatorChar),install,StringComparison.OrdinalIgnoreCase);
        if(marker!=null&&marker.TryGetValue("physicalRoot",out physicalRoot)&&!String.IsNullOrWhiteSpace(Convert.ToString(physicalRoot)))matches|=String.Equals(Path.GetFullPath(Convert.ToString(physicalRoot)).TrimEnd(Path.DirectorySeparatorChar),install,StringComparison.OrdinalIgnoreCase);
        if(marker==null||!marker.TryGetValue("kind",out kind)||Convert.ToString(kind)!="DailyAgentInstallation"||!matches)throw new InvalidOperationException("Invalid Daily Agent installation marker");
        runtime=Path.Combine(install,"runtime");
      }
      foreach(string part in parts)runtime=Path.Combine(runtime,part);
      return runtime;
    }
  }
}
