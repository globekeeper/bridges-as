#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct MinimalGitHubRepo {
    pub id: u32,
    #[napi(js_name = "full_name")]
    pub full_name: String,
    #[napi(js_name = "html_url")]
    pub html_url: String,
    pub description: Option<String>,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct MinimalGitHubIssue {
    pub id: u32,
    #[napi(js_name = "html_url")]
    pub html_url: String,
    pub number: u32,
    pub title: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct GitHubIssueMessageBodyRepo {
    pub id: u32,
    pub name: String,
    pub url: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct GitHubIssueMessageBodyIssue {
    pub id: u32,
    pub number: u32,
    pub title: String,
    pub url: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct GitHubRepoMessageBody {
    #[serde(rename = "gk.bridgeas.github.repo")]
    #[napi(js_name = "gk.bridgeas.github.repo")]
    pub repo: GitHubIssueMessageBodyRepo,
    #[napi(js_name = "external_url")]
    pub external_url: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct GitHubIssueMessageBody {
    #[serde(rename = "gk.bridgeas.github.issue")]
    #[napi(js_name = "gk.bridgeas.github.issue")]
    pub issue: GitHubIssueMessageBodyIssue,
    #[serde(rename = "gk.bridgeas.github.repo")]
    #[napi(js_name = "gk.bridgeas.github.repo")]
    pub repo: GitHubIssueMessageBodyRepo,
    #[napi(js_name = "external_url")]
    pub external_url: String,
}
