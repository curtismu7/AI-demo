import { useEffect, useState } from "react";
import { loadPublicConfig } from "../services/configService";

export function useAppFlags() {
  const [appFlags, setAppFlags] = useState({
    showEducationPanel: true,
    enableTokenChainDisplay: true,
    agentUiMode: "standard",
    debugShowTokenDetails: false,
    debugShowApiCalls: false,
    logFilterCategories: "",
  });

  useEffect(() => {
    loadPublicConfig()
      .then((cfg) => {
        setAppFlags({
          showEducationPanel:
            cfg.show_education_panel !== false &&
            cfg.show_education_panel !== "false",
          enableTokenChainDisplay:
            cfg.enable_token_chain_display !== false &&
            cfg.enable_token_chain_display !== "false",
          agentUiMode: cfg.agent_ui_mode || "standard",
          debugShowTokenDetails:
            cfg.debug_show_token_details === true ||
            cfg.debug_show_token_details === "true",
          debugShowApiCalls:
            cfg.debug_show_api_calls === true ||
            cfg.debug_show_api_calls === "true",
          logFilterCategories: cfg.log_filter_categories || "",
        });
      })
      .catch(() => {});
  }, []);

  return { appFlags };
}
