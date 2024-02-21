#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct JiraProject {
    #[serde(rename = "self")]
    pub _self: String,
    pub id: String,
    pub key: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]

pub struct JiraIssue {
    #[serde(rename = "self")]
    pub _self: String,
    pub id: String,
    pub key: String,
    pub fields: JiraIssueFields,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct JiraIssueFields {
    pub project: JiraProject,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct JiraIssueLight {
    #[serde(rename = "self")]
    pub _self: String,
    pub key: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct JiraIssueSimpleItem {
    pub id: String,
    pub key: String,
    #[napi(js_name = "api_url")]
    pub api_url: String,
}
#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct JiraIssueMessageBody {
    #[serde(rename = "gk.bridgeas.jira.issue")]
    #[napi(js_name = "gk.bridgeas.jira.issue")]
    pub jira_issue: JiraIssueSimpleItem,
    #[serde(rename = "gk.bridgeas.jira.project")]
    #[napi(js_name = "gk.bridgeas.jira.project")]
    pub jira_project: JiraIssueSimpleItem,
    #[napi(js_name = "external_url")]
    pub external_url: String,
}

#[derive(Serialize, Debug, Deserialize)]
#[napi(object)]
pub struct JiraVersion {
    #[serde(rename = "self")]
    pub _self: String,
    pub id: String,
    pub description: String,
    pub name: String,
    #[serde(rename = "projectId")]
    pub project_id: String,
}
