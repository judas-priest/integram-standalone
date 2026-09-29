<?php
header("Cache-Control: no-store, no-cache, must-revalidate");
header("Content-Type: text/html; charset=UTF-8");
header("Expires: ".date("r"));
header('Access-Control-Allow-Headers: X-Authorization, x-authorization,Content-Type,content-type,Origin,Authorization,authorization');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Origin: *');
mb_internal_encoding("UTF-8");

define("DB_MASK", "/^[a-z]\w{1,14}$/i");  # Mask for the DB name validation
define("USER_DB_MASK", "/^[a-z]\w{2,14}$/i");  # Mask for the DB name validation
define("DIR_MASK", "/^[a-z0-9_]+$/i");  # Mask for the dir name validation
define("FILE_MASK", "/^[a-z0-9_.]+$/i");  # Mask for the dir name validation
define("LOGS_DIR", "logs/");  # Logs files folder
define("USER", 18);
define("DATABASE", 271);
define("PHONE", 30);
define("XSRF", 40);
define("EMAIL", 41);
define("ROLE", 42);
define("ACTIVITY", 124);
define("PASSWORD", 20);
define("TOKEN", 125);
define("SECRET", 130);
define("VERSION", 8);
define("VAL_LIM", 127);  # Maximum length of the value (val) field on UI

$com = explode("?", strtolower($_SERVER["REQUEST_URI"]));
$com = explode("/", $com[0]);
if(isset($com[1]))
	$z = $com[1]; # Get the DB name
else
    $z = "my";
    
if($z==="auth.asp" && !empty($_GET['code']))
    $z = "my";
elseif(!preg_match(DB_MASK, $z))
        die("Invalid database");
include "include/connection.php";        
# Check the DB existence
if(!mysqli_query($connection, "SELECT 1 FROM $z LIMIT 1")){
    header("HTTP/1.0 404 Not found");
    die("$z does not exist");
}
$locale = isset($_COOKIE[$z."_locale"]) ? $_COOKIE[$z."_locale"] : (isset($_COOKIE["my_locale"]) ? $_COOKIE["my_locale"] : "RU");
																											
# The trace cookie to be deleted upon the session close
if(isset($_REQUEST["TRACE_IT"]) || isset($_COOKIE["TRACE_IT"])){
	$GLOBALS["TRACE"] = "****".$_SERVER["REQUEST_URI"]."<br/>\n";
    if(isset($_GET["TRACE_IT"]))
	    setcookie("TRACE_IT", 1, time() + 3600*3, "/$z"); // 3 hours
	$logPath = "templates/custom/$z/logs";
	if(!is_dir($logPath))
		mkdir($logPath);
	$logFile = "$logPath/trace".date("YmdHis").".log";
    $file = fopen($logFile, "a");
    fwrite($file, $GLOBALS["TRACE"]."\n");
    $headers =  getallheaders();
    $hdr = "";
    foreach($headers as $key=>$val)
        $hdr .= $key . ': ' . $val . '<br>';
    wlog(" headers: $hdr", "log");
    fclose($file);
}
# Fetch all the parameters from the body and log them
$params = "";
if(strlen(file_get_contents('php://input'))){
    $json = json_decode(file_get_contents('php://input'), true);
    if(json_last_error() === JSON_ERROR_NONE)
        foreach($json AS $key => $value)
            $_POST[$key] = $_REQUEST[$key] = $value;
}
foreach($_POST AS $key => $value)
	if(is_array($value))
		$params .= "\n $key " . print_r($value, true) . "\n";
	else
		if(strlen($value) && ($key != "pwd"))	# Do not log passwords
			$params .= " $key=$value;";
$isAPI = isset($_POST["JSON"]) || isset($_GET["JSON"]) || isset($_POST["JSON_DATA"]) || isset($_GET["JSON_DATA"]) || isset($_POST["JSON_KV"]) || isset($_GET["JSON_KV"]) || isset($_POST["JSON_CR"]) || isset($_GET["JSON_CR"]) || isset($_POST["JSON_HR"]) || isset($_GET["JSON_HR"]);
wlog($_SERVER["REMOTE_ADDR"]." ".$_SERVER["REQUEST_URI"]." $params", "log");
if(($z === "my") && ((isset($com[2]) ? $com[2] : "") === "register")){ # Register the user
    # Check if this is a confirmation request
    if(isset($_GET["c"]) && isset($_GET["u"])){
    	$u = (int)$_GET["u"];
    	if($u > 0){
        	$result = Exec_sql("SELECT user.val user, user.id uid, token.id tok, token.val token, xsrf.id xsrf, act.id act, pwd.val pwd, pwd.id pid, email.val email
                                FROM $z user LEFT JOIN $z token ON token.up=user.id AND token.t=".TOKEN
                                        ." LEFT JOIN $z xsrf ON xsrf.up=user.id AND xsrf.t=".XSRF
                                        ." LEFT JOIN $z pwd ON pwd.up=user.id AND pwd.t=".PASSWORD
                                        ." LEFT JOIN $z act ON act.up=user.id AND act.t=".ACTIVITY
                                        ." LEFT JOIN $z email ON email.up=user.id AND email.t=".EMAIL
                                ." WHERE user.id=$u AND user.t=".USER
							, "Check user & conf code");
        	if($row = mysqli_fetch_array($result))
        		if($row["uid"]){ # User found
        			# Update the user in the CRM
        			Exec_sql("UPDATE $z SET val='".sha1(Salt($row["user"], $row["pwd"]))."' WHERE id=".$row["pid"], "Update user's password");
        			updateTokens($row);
                	createDb($row["uid"], "", $row["email"], $row["pwd"]);
            		header("Location: /$z");
            		die();
                }
    	}
		login($z, "", "EXPIRED");
    }
    elseif(isset($_POST["email"])){
        $email = addslashes($_POST["email"]);
        $msg = "";
    	if(!preg_match("/.+@.+\..+/i", $email))
    		$msg .= t9n("[RU]Вы ввели неверный email[EN]Please provide a correct email")."<br/><br/>\n";
    	if(!strlen($_POST["regpwd"]) || !strlen($_POST["regpwd1"]))
    		$msg .= t9n("[RU]Введен пустой пароль[EN]Please input the password")."<br/><br/>\n";
    	elseif(strlen($_POST["regpwd"]) < 6)
    		$msg .= t9n("[RU]Введенный вами пароль слишком короток (менее 6 символов)[EN]The password must be at least 6 characters long")."<br/><br/>\n";
    	elseif($_POST["regpwd"] != $_POST["regpwd1"])
    		$msg .= t9n("[RU]Введенные вами пароли не совпадают[EN]Repeat the same password twice")."<br/><br/>\n";
    	if(!strlen($_POST["agree"]))
    		$msg .= t9n("[RU]Пожалуйста, поставьте отметку, что ознакомились с&nbsp;Лицензионным соглашением"
    		    ."[EN]Please confirm that you have read the&nbsp;<a href=\"offer.html\">papers to protect you")."<br/><br/>\n";
        # Stage one: Inform of the errors, if any, and let him try again
        if(strlen($msg))
        	my_die($msg);
        
        if($row = mysqli_fetch_array(Exec_sql("SELECT 1 FROM $z WHERE val='$email' AND t=".USER, "Check user name uniquity")))
        	if($row[0])	# Inform of the errors, if any, and let him try again
        		my_die(t9n("[RU]Этот email уже зарегистрирован.[EN]This email is already registered")." [errMailExists]");

        # Insert new user and its data into CRM
        $id = newUser($email, $email, "115", "", "");
        Insert($id, 1, PASSWORD, $_POST["regpwd"], "Insert password");
        $confirm = md5("xz$email");
        Insert($id, 1, TOKEN, $confirm, "Insert confirmation code");
        if(isset($_COOKIE["_aff"]))
            Insert($id, 1, 1012, (int)$_COOKIE["_aff"], "Insert the affiliate ref");
        $db = mail2DB($email, $id);
        # Inform the admin
        mysendmail(ADMINEMAIL, "Registration from ".$_SERVER["SERVER_NAME"].": $email"
        	, "Email: ".$email."\nhttps://".$_SERVER["SERVER_NAME"]."/$db/object/".USER);
        # Send the confirmation letter to the new user
        mysendmail($email, t9n("[RU]Регистрация на сервисе [EN]Registration from ").$_SERVER["SERVER_NAME"]
        	, t9n("[RU]\r\nЗдравствуйте![EN]Hello my friend,")."\r\n\r\n"
        	    .t9n("[RU]Для подтверждения регистрации пройдите по ссылке:[EN]To complete the registration click the following link:")
        	        ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?u=$id&c=$confirm\r\n"
        		.t9n("[RU]или скопируйте её и откройте в Вашем web-браузере.\r\nЭта ссылка действительна в течение трех дней."
        		    ."[EN]or copy its text and open it in your Internet browser.\r\nThe link will expire in 3 days.")
        		."\r\n".t9n("[RU]Имя вашей базы[EN]The name of your database").": $db, ".t9n("[RU]пользователь[EN]user").": $db"
        		."\r\n\r\n".t9n("[RU]После подтверждения ваша база будет здесь[EN]After the confirmation you will find your database here")
                	.":\r\nhttps://".$_SERVER["SERVER_NAME"]."/$db?login=$db"
        		."\r\n\r\n".t9n("[RU]С уважением,\r\nКоманда Интеграл[EN]Best regards,\r\nIdeaV team")
        		."\r\n\r\n".t9n("[RU]Если вы не хотите получать от нас писем, связанных с регистрацией, вы можете отписаться от оповещений:"
                                ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?optout=$id"
        	                ."[EN]In case you do not want to receive messages regarding your registration, unsubscribe here:"
                                ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?optout=$id"));
    	login($db, "", "toConfirm");
    }
    elseif(isset($_GET["optout"]))
        die(t9n("[RU]Вы отписались от рассылки для [EN]You have cancelled the email subscription for ").htmlspecialchars($_GET["optout"]));
    else
        my_die("Запрос не распознан");
}
elseif(($z == "my") && !empty($_GET['code'])){
    # owner@example.com
    $params = array(
    	'client_id'     => G_CLIENT_ID,
    	'client_secret' => G_CLIENT_PK,
    	'redirect_uri'  => 'https://'.$_SERVER["SERVER_NAME"].'/auth.asp',
    	'grant_type'    => 'authorization_code',
    	'code'          => $_GET['code']
    );	
    
    $ch = curl_init('https://accounts.google.com/o/oauth2/token');
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $params); 
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_HEADER, false);
    $data = curl_exec($ch);
    curl_close($ch);
    
    $data = json_decode($data, true);
    if(!empty($data['access_token'])){
    	# Got the token, retrieve the user data
    	$params = array('access_token' => $data['access_token'],
            		'id_token'     => $data['id_token'],
            		'token_type'   => 'Bearer',
            		'expires_in'   => 3599);
    	$info = file_get_contents('https://www.googleapis.com/oauth2/v1/userinfo?' . urldecode(http_build_query($params)));
    	$info = json_decode($info, true);
        if(!isset($info["id"])) # In case the token is invalid
            my_die("Authentication error");
        $db = isset($_GET['state'])?(checkDbName(USER_DB_MASK, $_GET['state'])?$_GET['state']:""):"";
        if($row = mysqli_fetch_array(Exec_sql("SELECT user.id uid, token.id tok, token.val token, xsrf.id xsrf, act.id act, db.val db
                                        FROM $z user LEFT JOIN $z token ON token.up=user.id AND token.t=".TOKEN
                                                ." LEFT JOIN $z xsrf ON xsrf.up=user.id AND xsrf.t=".XSRF
                                                ." LEFT JOIN $z act ON act.up=user.id AND act.t=".ACTIVITY
                                                ." LEFT JOIN $z db ON db.up=user.id AND db.t=".DATABASE
                                                .(strlen($db)?" AND db.val='$db'":"")
                                        ." WHERE user.val='".$info["id"]."' AND user.t=".USER
                                            , "Get google user and their DBs"))){
			updateTokens($row);
    	    if($row["db"]){
    	        $z = $row["db"];
    	        # Get the token of the target DB to let the google user use it
                if($row = mysqli_fetch_array(Exec_sql("SELECT user.id, token.val tok, xsrf.val xsrf FROM $z user LEFT JOIN $z token ON token.up=user.id AND token.t=".TOKEN
                                                        ." LEFT JOIN $z xsrf ON xsrf.up=user.id AND xsrf.t=".XSRF
                                                    ." WHERE user.val='$z' AND user.t=".USER
                                                    , "Get token for google user"))){
        	        if($row["tok"])
            	        $token = $row["tok"];
            	    else{
            			$token = md5(microtime(TRUE));
                        Insert($row["id"], 1, TOKEN, $token, "Reset token for G admin");
            	    }
        	        if(!$row["xsrf"])
                        Insert($row["id"], 1, XSRF, xsrf($token, $z), "Reset xsrf for G admin");
                }
    	        else
            		login($z, "", "adminNotFound");
    	    }
    	    else
    	        $token = $row["token"];
        	setcookie($z, $token, time() + 2592000*12, "/"); # 30*12 days
    	}
        else{
			$GLOBALS["GLOBAL_VARS"]["token"] = md5(microtime(TRUE));
			$GLOBALS["GLOBAL_VARS"]["xsrf"] = xsrf($GLOBALS["GLOBAL_VARS"]["token"], $z);
            $id = newUser($info["id"], $info["email"], "115", $info["name"], $info["picture"]);
            Insert($id, 1, 274, "Google", "Set social for new G user");
            Insert($id, 1, TOKEN, $GLOBALS["GLOBAL_VARS"]["token"], "Set token for new G user");
            Insert($id, 1, XSRF, $GLOBALS["GLOBAL_VARS"]["xsrf"], "Set xsrf for new G user");
            #Insert($id, 1, 1143, "1146", "Insert new Plan ref");
            #Insert($id, 1, 1145, date("Ymd", strtotime("+1 months") + $GLOBALS["tzone"]), "Insert new Plan date");
            if(isset($_COOKIE["_aff"]))
                Insert($id, 1, 1012, (int)$_COOKIE["_aff"], "Insert the googel affiliate ref");
        	setcookie($z, $GLOBALS["GLOBAL_VARS"]["token"], time() + 2592000*12, "/"); # 30*12 days
        	createDb($id, $info["name"], $info["email"]);
        }
		header("Location: ".(isset($_GET['state'])?$_GET['state']:"/$z"));
    }
	die();
}
elseif($_SERVER["REQUEST_METHOD"] == "OPTIONS"){
	header("Allow: GET,POST,OPTIONS");
	header("Content-Length: 0");
	die();
}
if(!is_dir(LOGS_DIR))
	mkdir(LOGS_DIR);
# Store the arguments
foreach($com as $k => $v)
    if($k > 2){
        $GLOBALS["GLOBAL_VARS"][$k]=$v;
        $args[strtolower($v)] = 1;
    }
$GLOBALS["GLOBAL_VARS"]["z"] = $z;
$GLOBALS["sqls"] = $GLOBALS["sql_time"] = 0;
# Fill in the global array of the basic data types
$GLOBALS["basics"] = array(
	3 => "SHORT",
	8 => "CHARS",
	9 => "DATE",
	13 => "NUMBER",
	14 => "SIGNED",
	11 => "BOOLEAN",
	12 => "MEMO",
	4 => "DATETIME",
	10 => "FILE",
	2 => "HTML",
	7 => "BUTTON",
	6 => "PWD",
	5 => "GRANT",
	15 => "CALCULATABLE",
	16 => "REPORT_COLUMN",
	17 => "PATH");
$GLOBALS["REV_BT"] = $GLOBALS["basics"];
$GLOBALS["BT"] = array_flip($GLOBALS["basics"]);

# Define ALIASES
define("MAIL_MASK", "/.+@.+\..+/i");  # Mask for the email validation
define("LOGIN_PAGE", " <A HREF=\"/$z\">Продолжить</A>.");  # Path to the login page
define("BACK_LINK" , " <A href=\"#\" onclick=\"history.back();\">Go back</A>");
define("PASSWORDSTARS" , "******");

define("REPORT", 22);
define("LEVEL", 47);
define("MASK", 49);
define("EXPORT", 55);
define("DELETE", 56);
define("ROLE_OBJECT", 116);
define("CONNECT", 226);
define("SETTINGS", 269);
define("SETTINGS_TYPE", 271);
define("SETTINGS_VAL", 273);

define("NOT_NULL_MASK", ":!NULL:");
define("MULTI_MASK", ":MULTI:");
define("ALIAS_MASK", "/:ALIAS=(.*?):/u");
define("ALIAS_DEF", ":ALIAS=");
# Default LIMIT parameter for queries with no filter
define("DEFAULT_LIMIT", isset($_COOKIE["default_limit"])&&(int)$_COOKIE["default_limit"]>4&&(int)$_COOKIE["default_limit"]<1001?(int)$_COOKIE["default_limit"]:20);
define("UPLOAD_DIR", "download/$z/");  # Uploaded files folder
define("DDLIST_ITEMS", 80);  # Default length of dropdown lists
define("COOKIES_EXPIRE", 2592000);  # Cookie expiration time (2592000 = 30 days)

define("REP_COLS", 28);
define("REP_JOIN", 44);
define("REP_HREFS", 95);
define("REP_URL", 97);
define("REP_LIMIT", 134);
define("REP_IFNULL", 113);
define("REP_WHERE", 262);
define("REP_ALIAS", 265);
define("REP_JOIN_ON", 266);

define("REP_COL_FORMAT", 29);
define("REP_COL_ALIAS", 58);
define("REP_COL_FUNC", 63);
define("REP_COL_TOTAL", 65);
define("REP_COL_NAME", 100);
define("REP_COL_FORMULA", 101);
define("REP_COL_FROM", 102);
define("REP_COL_TO", 103);
define("REP_COL_HAV_FR", 105);
define("REP_COL_HAV_TO", 106);
define("REP_COL_HIDE", 107);
define("REP_COL_SORT", 109);
define("REP_COL_SET", 132);

define("CUSTOM_REP_COL", t9n("[RU]Вычисляемое[EN]Calculatable"));
define("TYPE_EDITOR", "*** Type editor ***");
define("ALL_OBJECTS", "*** All objects ***");
define("FILES", "*** Files ***");

$GLOBALS["GLOBAL_VARS"]["version"] = VERSION;

# ################# FUNCTIONS #################
function isApi(){
    global $isAPI;
    return $isAPI;
}
function mail2DB($email, $uid){
	# Try converting the user's email into the DB name
    $tmp = explode('@', $email);
    $db = strtolower(substr(preg_replace("/[^A-Za-z0-9 ]/", '', array_shift($tmp)), 0, 15));
    # In case the name does not fit, try using 'g' + user ID
    if(!checkDbName(USER_DB_MASK, $db) || !isDbVacant($db))
        $db = "g$uid";
    return $db;
}
function createDb($id, $name, $email, $pwd=""){
	global $z, $locale;
	$db = mail2DB($email, $id);
    if(isDbVacant($db)){
        $template = $locale === "EN" ? "en" : "ru";
        newDb($db, $template, $name, $email, $pwd);
        $id = Insert($id, 1, DATABASE, $db, "Register new DB");
        Insert($id, 1, 275, date("Ymd"), "Insert new DB date");
        Insert($id, 1, 283, $template, "Insert new DB template");
        Insert($id, 1, 276, t9n("[RU]Тестовая база, создана при регистрации[EN]Test one, created upon registration"), "Insert new DB notes");
        $z = $db;
    }
}
function updateTokens($row){
	global $z;
	// Сначала определяем $token
	if($row["tok"])
    	$token = $GLOBALS["GLOBAL_VARS"]["token"] = $row["token"];
	else{
    	$token = $GLOBALS["GLOBAL_VARS"]["token"] = md5(microtime(TRUE));
		Insert($row["uid"], 1, TOKEN, $token, "Save token");
	}
	// Теперь можем использовать $token для xsrf
	$xsrf = $GLOBALS["GLOBAL_VARS"]["xsrf"] = xsrf($token, $z);
	setcookie($z, $token, time() + 2592000*12, "/"); # 30*12 days
	if($row["xsrf"])
		Update_Val($row["xsrf"], $xsrf);
	else
		Insert($row["uid"], 1, XSRF, $xsrf, "Save xsrf");
	if($row["act"])
		Update_Val($row["act"], microtime(TRUE));
	else
		Insert($row["uid"], 1, ACTIVITY, microtime(TRUE), "Save activity time");
}
# Create a new DB for a user
function newDb($db, $template, $name, $email, $pwd){
    global $z, $locale;
    $oldz = $z;
    $z = $db;
	if(strpos(TEMPLATES, ":".strtolower($template).":") !== false) # List of available templates
		$template = strtolower($template);
	else
		$template = "ru";
	Exec_sql("CREATE TABLE $z LIKE $template", "Create the initial table");
	Exec_sql("INSERT INTO $z SELECT * FROM $template", "Fill in the table by template");

	# Insert new user and its data into his DB
	$id = Insert(1, 0, USER, $z, "Insert new DB user");
    Insert($id, 1, 156, date("Ymd"), "Insert date");
	if(strlen($email))
		Insert($id, 1, EMAIL, $email, "Insert DB email");
	if(strlen($name))
		Insert($id, 1, 33, $name, "Insert user name");
	Insert($id, 1, 145, "115", "Insert Admin role link");
	
    # Set token and xsfr as of the current user's
	Insert($id, 1, TOKEN, $GLOBALS["GLOBAL_VARS"]["token"], "Save token DB");
	Insert($id, 1, XSRF, $GLOBALS["GLOBAL_VARS"]["xsrf"], "Save xsrf DB");
	Insert($id, 1, ACTIVITY, microtime(TRUE), "Save activity time DB");
    if(strlen($pwd))
        Insert($id, 1, PASSWORD, sha1(Salt($z, $pwd)), "Insert user password");
	setcookie($z, $GLOBALS["GLOBAL_VARS"]["token"], time() + 2592000*12, "/"); # 30*12 days
	
	# Create folders for files and templates
	exec("cp -r templates/custom/$template templates/custom/$z");
	exec("cp -r download/$template download/$z");
	
    mysendmail(ADMINEMAIL, "New DB from ".$_SERVER["SERVER_NAME"].": $z"
            , "Email: ".$email."\nhttps://".$_SERVER["SERVER_NAME"]."/$z/object/".USER);
	setcookie($z."_locale", $locale, time() + 2592000000, "/"); # Forever
    $z = $oldz;
}
# Insert new user and their data into CRM
function newUser($user, $email, $role, $name, $picture){
    $id = Insert(1, 0, USER, $user, "Insert new user");
    Insert($id, 1, EMAIL, $email, "Insert email");
    Insert($id, 1, 164, $role, "Insert User role link");
    # My CRM's specific data
    Insert($id, 1, 156, date("Ymd"), "Insert date");
	if(strlen($name))
        Insert($id, 1, 33, $name, "Insert name");
	if(strlen($picture))
        Insert($id, 1, 280, $picture, "Insert picture");
    return $id;
}
function checkDbNameReserved($db)
{
    # Reserved MySQL clauses
    return strpos("|ACCESSIBLE|ACCOUNT|ACTION|ACTIVE|ADD|ADMIN|AFTER|AGAINST|AGGREGATE|ALGORITHM|ALL|ALTER|ALWAYS|ANALYSE|ANALYZE|AND|ANY|ARRAY|ASC|ASCII|ASENSITIVE|ATTRIBUTE|AUTHENTICATION|AUTOEXTEND_SIZE|AUTO_INCREMENT"
    ."|AVG|AVG_ROW_LENGTH|BACKUP|BEFORE|BEGIN|BETWEEN|BIGINT|BINARY|BINLOG|BIT|BLOB|BLOCK|BOOL|BOOLEAN|BOTH|BTREE|BUCKETS|BULK|BYTE|CACHE|CALL|CASCADE|CASCADED|CASE|CATALOG_NAME|CHAIN|CHANGE|CHANGED|CHANNEL|CHAR|"
    ."CHARACTER|CHARSET|CHECK|CHECKSUM|CIPHER|CLASS_ORIGIN|CLIENT|CLONE|CLOSE|COALESCE|CODE|COLLATE|COLLATION|COLUMN|COLUMNS|COLUMN_FORMAT|COLUMN_NAME|COMMENT|COMMIT|COMMITTED|COMPACT|COMPLETION|COMPONENT|COMPRESSED|"
    ."COMPRESSION|CONCURRENT|CONDITION|CONNECTION|CONSISTENT|CONSTRAINT|CONSTRAINT_NAME|CONTAINS|CONTEXT|CONTINUE|CONVERT|CPU|CREATE|CROSS|CUBE|CUME_DIST|CURRENT|CURRENT_DATE|CURRENT_TIME|CURRENT_USER|CURSOR|CURSOR_NAME"
    ."|DATA|DATABASE|DATABASES|DATAFILE|DATE|DATETIME|DAY|DAY_HOUR|DAY_MICROSECOND|DAY_MINUTE|DAY_SECOND|DEALLOCATE|DEC|DECIMAL|DECLARE|DEFAULT|DEFAULT_AUTH|DEFINER|DEFINITION|DELAYED|DELAY_KEY_WRITE|DELETE|DENSE_RANK|"
    ."DESC|DESCRIBE|DESCRIPTION|DES_KEY_FILE|DETERMINISTIC|DIAGNOSTICS|DIRECTORY|DISABLE|DISCARD|DISK|DISTINCT|DISTINCTROW|DIV|DOUBLE|DROP|DUAL|DUMPFILE|DUPLICATE|DYNAMIC|EACH|ELSE|ELSEIF|EMPTY|ENABLE|ENCLOSED|ENCRYPTION"
    ."|END|ENDS|ENFORCED|ENGINE|ENGINES|ENUM|ERROR|ERRORS|ESCAPE|ESCAPED|EVENT|EVENTS|EVERY|EXCEPT|EXCHANGE|EXCLUDE|EXECUTE|EXISTS|EXIT|EXPANSION|EXPIRE|EXPLAIN|EXPORT|EXTENDED|EXTENT_SIZE|FACTOR|FALSE|FAST|FAULTS|FETCH"
    ."|FIELDS|FILE|FILE_BLOCK_SIZE|FILTER|FINISH|FIRST|FIRST_VALUE|FIXED|FLOAT|FLOAT4|FLOAT8|FLUSH|FOLLOWING|FOLLOWS|FOR|FORCE|FOREIGN|FORMAT|FOUND|FROM|FULL|FULLTEXT|FUNCTION|GENERAL|GENERATE|GENERATED|GEOMCOLLECTION|"
    ."GEOMETRY|GET|GET_FORMAT|GLOBAL|GRANT|GRANTS|GROUP|GROUPING|GROUPS|GTID_ONLY|HANDLER|HASH|HAVING|HELP|HIGH_PRIORITY|HISTOGRAM|HISTORY|HOST|HOSTS|HOUR|HOUR_MINUTE|HOUR_SECOND|IDENTIFIED|IGNORE|IMPORT|INACTIVE|INDEX|"
    ."INDEXES|INFILE|INITIAL|INITIAL_SIZE|INITIATE|INNER|INOUT|INSENSITIVE|INSERT|INSERT_METHOD|INSTALL|INSTANCE|INT|INT1|INT2|INT3|INT4|INT8|INTEGER|INTERSECT|INTERVAL|INTO|INVISIBLE|INVOKER|IO_AFTER_GTIDS|IO_BEFORE_GTIDS"
    ."|IO_THREAD|IPC|ISOLATION|ISSUER|ITERATE|JOIN|JSON|JSON_TABLE|JSON_VALUE|KEY|KEYRING|KEYS|KEY_BLOCK_SIZE|KILL|LAG|LANGUAGE|LAST|LAST_VALUE|LATERAL|LEAD|LEADING|LEAVE|LEAVES|LEFT|LESS|LEVEL|LIKE|LIMIT|LINEAR|LINES|"
    ."LINESTRING|LIST|LOAD|LOCAL|LOCALTIME|LOCALTIMESTAMP|LOCK|LOCKED|LOCKS|LOGFILE|LOGS|LONG|LONGBLOB|LONGTEXT|LOOP|LOW_PRIORITY|MASTER|MASTER_BIND|MASTER_DELAY|MASTER_HOST|MASTER_LOG_FILE|MASTER_LOG_POS|MASTER_PASSWORD|"
    ."MASTER_PORT|MASTER_SSL|MASTER_SSL_CA|MASTER_SSL_CERT|MASTER_SSL_CRL|MASTER_SSL_KEY|MASTER_USER|MATCH|MAXVALUE|MAX_ROWS|MAX_SIZE|MEDIUM|MEDIUMBLOB|MEDIUMINT|MEDIUMTEXT|MEMBER|MEMORY|MERGE|MESSAGE_TEXT|MICROSECOND|"
    ."MIDDLEINT|MIGRATE|MINUTE|MINUTE_SECOND|MIN_ROWS|MOD|MODE|MODIFIES|MODIFY|MONTH|MULTILINESTRING|MULTIPOINT|MULTIPOLYGON|MUTEX|MYSQL_ERRNO|NAME|NAMES|NATIONAL|NATURAL|NCHAR|NDB|NDBCLUSTER|NESTED|NEVER|NEW|NEXT|"
    ."NODEGROUP|NONE|NOT|NOWAIT|NO_WAIT|NTH_VALUE|NTILE|NULL|NULLS|NUMBER|NUMERIC|NVARCHAR|OFF|OFFSET|OLD|ONE|ONLY|OPEN|OPTIMIZE|OPTIMIZER_COSTS|OPTION|OPTIONAL|OPTIONALLY|OPTIONS|ORDER|ORDINALITY|ORGANIZATION|OTHERS|"
    ."OUT|OUTER|OUTFILE|OVER|OWNER|PACK_KEYS|PAGE|PARSER|PARTIAL|PARTITION|PARTITIONING|PARTITIONS|PASSWORD|PATH|PERCENT_RANK|PERSIST|PERSIST_ONLY|PHASE|PLUGIN|PLUGINS|PLUGIN_DIR|POINT|POLYGON|PORT|PRECEDES|PRECEDING|"
    ."PRECISION|PREPARE|PRESERVE|PREV|PRIMARY|PRIVILEGES|PROCEDURE|PROCESS|PROCESSLIST|PROFILE|PROFILES|PROXY|PURGE|QUARTER|QUERY|QUICK|RANDOM|RANGE|RANK|READ|READS|READ_ONLY|READ_WRITE|REAL|REBUILD|RECOVER|RECURSIVE|"
    ."REDOFILE|REDUNDANT|REFERENCE|REFERENCES|REGEXP|REGISTRATION|RELAY|RELAYLOG|RELAY_LOG_FILE|RELAY_LOG_POS|RELAY_THREAD|RELEASE|RELOAD|REMOTE|REMOVE|RENAME|REORGANIZE|REPAIR|REPEAT|REPEATABLE|REPLACE|REPLICA|REPLICAS"
    ."|REPLICATE_DO_DB|REPLICATION|REQUIRE|RESET|RESIGNAL|RESOURCE|RESPECT|RESTART|RESTORE|RESTRICT|RESUME|RETAIN|RETURN|RETURNING|RETURNS|REUSE|REVERSE|REVOKE|RIGHT|RLIKE|ROLE|ROLLBACK|ROLLUP|ROTATE|ROUTINE|ROW|ROWS|"
    ."ROW_COUNT|ROW_FORMAT|ROW_NUMBER|RTREE|SAVEPOINT|SCHEDULE|SCHEMA|SCHEMAS|SCHEMA_NAME|SECOND|SECONDARY|SECONDARY_LOAD|SECURITY|SELECT|SENSITIVE|SEPARATOR|SERIAL|SERIALIZABLE|SERVER|SESSION|SET|SHARE|SHOW|SHUTDOWN|"
    ."SIGNAL|SIGNED|SIMPLE|SKIP|SLAVE|SLOW|SMALLINT|SNAPSHOT|SOCKET|SOME|SONAME|SOUNDS|SOURCE|SOURCE_BIND|SOURCE_DELAY|SOURCE_HOST|SOURCE_LOG_FILE|SOURCE_LOG_POS|SOURCE_PASSWORD|SOURCE_PORT|SOURCE_SSL|SOURCE_SSL_CA|"
    ."SOURCE_SSL_CERT|SOURCE_SSL_CRL|SOURCE_SSL_KEY|SOURCE_USER|SPATIAL|SPECIFIC|SQL|SQLEXCEPTION|SQLSTATE|SQLWARNING|SQL_AFTER_GTIDS|SQL_BIG_RESULT|SQL_CACHE|SQL_NO_CACHE|SQL_THREAD|SQL_TSI_DAY|SQL_TSI_HOUR|SQL_TSI_MINUTE"
    ."|SQL_TSI_MONTH|SQL_TSI_QUARTER|SQL_TSI_SECOND|SQL_TSI_WEEK|SQL_TSI_YEAR|SRID|SSL|STACKED|START|STARTING|STARTS|STATUS|STOP|STORAGE|STORED|STRAIGHT_JOIN|STREAM|STRING|SUBCLASS_ORIGIN|SUBJECT|SUBPARTITION|SUBPARTITIONS"
    ."|SUPER|SUSPEND|SWAPS|SWITCHES|SYSTEM|TABLE|TABLES|TABLESPACE|TABLE_CHECKSUM|TABLE_NAME|TEMPORARY|TEMPTABLE|TERMINATED|TEXT|THAN|THEN|THREAD_PRIORITY|TIES|TIME|TIMESTAMP|TIMESTAMPADD|TIMESTAMPDIFF|TINYBLOB|TINYINT|"
    ."TINYTEXT|TLS|TRAILING|TRANSACTION|TRIGGER|TRIGGERS|TRUE|TRUNCATE|TYPE|TYPES|UNBOUNDED|UNCOMMITTED|UNDEFINED|UNDO|UNDOFILE|UNICODE|UNINSTALL|UNION|UNIQUE|UNKNOWN|UNLOCK|UNREGISTER|UNSIGNED|UNTIL|UPDATE|UPGRADE|URL|"
    ."USAGE|USE|USER|USER_RESOURCES|USE_FRM|USING|UTC_DATE|UTC_TIME|UTC_TIMESTAMP|VALIDATION|VALUE|VALUES|VARBINARY|VARCHAR|VARCHARACTER|VARIABLES|VARYING|VCPU|VIEW|VIRTUAL|VISIBLE|WAIT|WARNINGS|WEEK|WEIGHT_STRING|WHEN|"
    ."WHERE|WHILE|WINDOW|WITH|WITHOUT|WORK|WRAPPER|WRITE|X509|XID|XML|XOR|YEAR|YEAR_MONTH|ZEROFILL|ZONE|", "|".strtoupper($db)."|") !== FALSE;
}
function checkDbName($mask, $db){
    return preg_match($mask, $db);
}
function xsrf($a, $b){
	return substr(sha1(Salt($a, $b)), 0, 22);
}
function login($z="", $u="", $message="", $details=""){
	wlog(" @".$_SERVER["REMOTE_ADDR"], "log");
	if(isApi())
		api_dump(json_encode(array("message"=>$message, "db"=>$z, "login"=>$u, "details"=>$details)), "login.json");
	$p = "?";
	if(strlen($z))
	    $p .= "db=$z&";
	if(strlen($u))
	    $p .= "login=$u&";
	elseif(isset($_GET["u"]))
	    $p .= "login=".htmlentities($_GET["u"])."&";
	elseif(isset($_GET["login"]))
	    $p .= "login=".htmlentities($_GET["login"])."&";
	if(strlen($message))
		$p .= "r=$message&";
    $p .= "uri=".htmlentities($_SERVER["REQUEST_URI"])."&";
	if(strlen($details))
		$p .= "d=".urlencode($details)."&";
	header("Location: /login.html".substr($p, 0, -1));
	die();
}
function wlog($text, $mode="log"){
    $file = fopen(LOGS_DIR.$GLOBALS["z"]."_$mode.txt", "a+");
    fwrite ($file, date("d/m/Y H:i:s")." $text\n");
    fclose($file);
}
function trace($text){
    global $logFile;
	if(isset($GLOBALS["TRACE"])){
		$GLOBALS["TRACE"] .= "$text <br>\n";
        $file = fopen($logFile, "a");
        fwrite($file, "$text <br>\n");
        fclose($file);
	}
}
# Execute SQL and measure the time it needs to be processed
function Exec_sql($sql, $err_msg, $log=TRUE, $fatal=TRUE){
	global $connection, $z;
	$time_start = microtime(TRUE);
	if(!$result = mysqli_query($connection, $sql))
	{
    	if(mysqli_errno($connection)===1146)
    	    login("", "", "dBNotExists", t9n("[RU]База $z не существует[EN]The $z DB does not exist")." [$err_msg]");
    	$msg = "Couldn't execute query [$err_msg] ".mysqli_error($connection)." ($sql; )";
    	if(!$fatal)
    	    return $msg;
		die_info($msg);
	}
	$time = microtime(TRUE) - $time_start;
	if($log && ((strtoupper(substr($sql, 0, 6)) != "SELECT") && (strtoupper(substr($sql, 0, 4)) != "SET "))){
	    if(strtoupper(substr($sql, 0, 6)) === "INSERT")
	        $sql = str_replace("INSERT INTO $z (up, ord, t, val) VALUES ("
	                        , "INSERT INTO $z (up, ord, t, val) VALUES (/*". mysqli_insert_id($connection)."*/ ", $sql);
	    wlog((isset($GLOBALS["GLOBAL_VARS"]["user"])?$GLOBALS["GLOBAL_VARS"]["user"]:"")."@".$_SERVER["REMOTE_ADDR"]."[".round($time, 4)."]$sql;[$err_msg]","sql");
	}
	trace("[".round($time, 4)."] $sql; [$err_msg]");
	if(isset($GLOBALS["sqls"])){
    	$GLOBALS["sqls"]++;
    	$GLOBALS["sql_time"] = $GLOBALS["sql_time"] + $time;
	}
	return $result;
}
# Apply hint for JOIN of the Ref requisites
function HintNeeded($k, $id)
{	# We might get filter set either in the report definition or online
    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$k]))
    {
        $str = str_replace(" ", "_", $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$k]);
    	if(isset($_REQUEST["FR_$str"]))
    		$c = $_REQUEST["FR_$str"];
    	elseif(isset($_REQUEST["TO_$str"]))
    		$c = $_REQUEST["TO_$str"];
    }
	if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$k]))
		$c = $GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$k];
	elseif(isset($GLOBALS["STORED_REPS"][$id][REP_COL_TO][$k]))
		$c = $GLOBALS["STORED_REPS"][$id][REP_COL_TO][$k];
	if(isset($c))
    	if(strlen($c))
    		if((substr($c,0,1)!="!") && (substr($c,0,1)!="%"))
    		{
    	        trace("Hint NOT needed for $k: $c");
    			return false;
    		}
    trace("HintNeeded for $k ".(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$k])?$GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$k]:""));
	return true;
}
# Translation $msg format: "[RU]Текст[EN]Text[DE]Texte"
function t9n($msg)
{
	global $locale;
    $l = mb_stripos($msg, "[".$locale."]");
    if($l === false)
        return $msg;
    $msg = mb_substr($msg, $l + 4);
    // Grab the text till the next language starts
    preg_match("/(.*?)\[[A-Z]{2}\]/ms", $msg, $tmp);
    if(isset($tmp[1]))
        return $tmp[1];
    return $msg;
}
# Check file extension
function BlackList($ext)
{
	if(stripos(". php cgi pl fcgi fpl phtml shtml php2 php3 php4 php5 asp jsp ", " $ext "))
		my_die(t9n("[RU]Недопустимый тип файла![EN]Wrong file extension!"));
}
# Get a hashed string
function GetSha($i)
{
	global $z;
	return sha1(Salt($z, $i));
}
# Get the Subdirectory name to securely store files on the server
function GetSubdir($id)
{
	return UPLOAD_DIR.floor($id / 1000).substr(GetSha(floor($id / 1000)), 0, 8);
}
# Get the Filename to securely store files on the server
function GetFilename($id)
{
	return substr("00$id", -3).substr(GetSha($id), 0, 8);
}
# Remove a directory on the server
function RemoveDir($path)
{
	if(is_dir($path))
	{
		$dirHandle = opendir($path);
		while(false !== ($file = readdir($dirHandle)))
			if($file!='.' && $file!='..')
			{
				$tmpPath = $path.'/'.$file; 
				if(is_dir($tmpPath))
					RemoveDir($tmpPath);
				elseif(!unlink($tmpPath))
					my_die(t9n("[RU]Не удалось удалить файл[EN]Cannot delete the file")." '$tmpPath'.");
			}
		closedir($dirHandle);
		if(!rmdir($path))
			die(t9n("[RU]Не удалось удалить директорию '[EN]Couldn't drop folder '").$path."'.");
	}
	elseif(!unlink($path))
		my_die(t9n("[RU]Не удалось удалить файл '[EN]Couldn't drop file '").$path."'.");
}
function checkInjection($value){
	if(preg_match("/(\b(from|select|table)\b)/i", $value, $match))
		die_info(t9n("[RU]Недопустимое значение для поиска: нельзя использовать служебные слова SQL. Найдено: ".
		        "[EN]No SQL clause allowed in search fields. Found: ").$match[0]);
    return $value;
}
# Make WHERE and JOIN statements for reports
function Construct_WHERE($key, $filter, $cur_typ, $join_req=0)
{
    if(!isset($GLOBALS["where"]))
        $GLOBALS["where"] = "";
    trace("Construct_WHERE for $key, filter: ".print_r($filter, true).", cur_typ: $cur_typ");
	global $z;
	$join = $join_req!=0;
	foreach($filter AS $f => $value){
		$is_date = FALSE; # Later we'll enclose date values in quotes $value => '$value'
		$LTGT = FALSE;
		$NOT_flag = FALSE;
		$NOT = "";
		$EQ = "=";
		trace(" value=$value");
		if(substr($value, 0, 1) == "!"){ # a NOT prefix in the equation
			$NOT = "NOT";
			$NOT_EQ = "!";
			$value = substr($value, 1);
			$NOT_flag = TRUE;
		}
		elseif(in_array(substr(ltrim($value), 0, 2), array(">=", "<="))){
			$NOT_EQ = substr(ltrim($value), 0, 2);
			$value = substr(ltrim($value), 2);
    		$EQ = "";
    	}
		elseif(in_array(substr(trim($value), 0, 1), array(">", "<"))){
			$NOT_EQ = substr(ltrim($value), 0, 1);
			$LTGT = TRUE;
			$value = substr(ltrim($value), 1);
    		$EQ = "";
    	}
    	else
        	$NOT_EQ = "";
		if(strpos($value, ".")){	# Get data from any existing block, identified by it's name
			$block = ".".strtolower(substr($value, 0, strpos($value, "."))); # Get the block name
			$len = strlen($block); # Block name length including the leading dot (".")
			foreach($GLOBALS["blocks"] as $block_id => $val) # Seek blocks
				if(substr($block_id, -$len) == $block)		# with names ending like the given one
					if(isset($val["CUR_VARS"][strtolower(substr($value, strpos($value, ".")+1))])){
						$value = $val["CUR_VARS"][strtolower(substr($value, strpos($value, ".")+1))];
						$GLOBALS["NO_CACHE"] = "";
						break;
					}
		}
		$value = BuiltIn($value); # Check for a built-in phrases
		if($value == "%")
			$search_val = "IS ".($NOT_flag ? "" : "NOT")." NULL";
		elseif((substr(trim(strtoupper($value)), 0, 3) == "IN(") && substr(trim($value), -1) == ")"){ # Multiple options - IN()
            $in = true;
            $value = substr(trim($value), 3, -1);
            checkInjection($value);
			$search_val = "$NOT IN($value)";
        }
        elseif((substr(trim(strtoupper($value)), 0, 4) == "@IN(") && substr(trim($value), -1) == ")"){ # Multiple IDs - IN()
            $v = substr(trim($value), 4, -1);
            if(strpos($v, "'") !== FALSE)
        		my_die(t9n("[RU]Неверный формат или нечисловые ID[EN]Invalid format or non-numeric IDs"));
        	$tmp = explode(",", $v);
        	foreach($tmp as $vin)
        	    if(!is_numeric($vin))
            		my_die(t9n("[RU]Недопустимы нечисловые ID[EN]Non-numeric IDs are nt alowed"));
			$search_val = "$NOT IN($v)";
			$inID = true;
    		$EQ = "";
        }
        else{ # If we have a [substitute], don't add '' and slash the existing ''
			if(preg_match("/\[([^\[\]]+)\]/", $value))
			    $v = strpos($value, "'") !== FALSE ? checkInjection($value) : $value;
		    else
		        $v = "'".addslashes($value)."' ";
			if(strpos($value, "%") === FALSE)
				$search_val = "$NOT_EQ$EQ$v";
			else
				$search_val = "$NOT LIKE $v";
		}
# Search by ID: @999999 or !@999999
		if(isset($GLOBALS["MULTI"][$key]))
			$GLOBALS["distinct"] = "DISTINCT"; # Array might return multiple rows, so we have to remove the dupes
		if(substr($value, 0, 1) == "@"){
		    if(isset($inID))
		        $value = $search_val;
            else
                $value = (int)str_replace(" ", "", substr($value, 1));
			if($key == $cur_typ)
				$GLOBALS["where"] .= " AND vals.id$NOT_EQ$EQ$value ";
			else{
				if($GLOBALS["REV_BT"][$key] == "ARRAY")
					$GLOBALS["distinct"] = "DISTINCT"; # Array might return multiple rows, so we have to remove the dupes
				if($NOT_flag){
					if(isset($GLOBALS["REF_typs"][$key])){
						$joinTable = "LEFT JOIN ($z r$key CROSS JOIN $z a$key) ON r$key.up=vals.id AND a$key.t=".$GLOBALS["REF_typs"][$key];
						$joinCond = "AND r$key.t=a$key.id AND r$key.val='$join_req'";
					}
					else{
						$joinTable = "LEFT JOIN $z a$key ON a$key.up=vals.id AND a$key.t=$key";
						$joinCond = "";
					}
        		    if(isset($inID))
						$GLOBALS["where"] .= " AND (a$key.id $search_val OR a$key.id IS NULL)";
					else
						$GLOBALS["where"] .= " AND (a$key.id!=$value OR a$key.id IS NULL)";
				}
				else{
				    trace(" Check if GLOBALS[REV_BT][$key] ".$GLOBALS["REV_BT"][$key]." == REFERENCE");
					if(isset($GLOBALS["REF_typs"][$key])){
						$joinTable = " JOIN ($z r$key CROSS JOIN $z a$key) ON r$key.up=vals.id AND r$key.t=a$key.id AND r$key.val='$join_req'";
						if(isset($inID))
    						$joinCond = " AND r$key.t $search_val";
    					else
    						$joinCond = " AND r$key.t=$value";
					}
					else{
						$joinTable = " JOIN $z a$key ON a$key.up=vals.id";
						$joinCond = " AND a$key.id $search_val";
					}
        		    if(isset($inID))
						$GLOBALS["where"] .= " AND a$key.id $search_val";
					else
						$GLOBALS["where"] .= " AND a$key.id=$value";
				}
				if($join && (strpos($GLOBALS["join"], $joinTable) === FALSE))
					$GLOBALS["join"] .= "$joinTable $joinCond";
			}
			break;
		}
# Construct WHERE according to the data type
        trace("_ REV_BT: ".(isset($GLOBALS["REV_BT"][$key])?$GLOBALS["REV_BT"][$key]:"No [REV_BT][$key]"));
        if(isset($GLOBALS["REF_typs"][$key])) # Filter was applied to the Object's Ref Value or ID
        {
    		if($join)
    			$GLOBALS["join"] .= " LEFT JOIN ($z r$key CROSS JOIN $z a$key) ON r$key.up=vals.id AND r$key.t=a$key.id
    									 AND r$key.val='$join_req' AND a$key.t=".$GLOBALS["REF_typs"][$key];
    		if($NOT_flag) # No match or empty
    			$GLOBALS["where"] .= " AND (a$key.val $search_val OR a$key.val IS NULL)";
    		else
    			$GLOBALS["where"] .= " AND a$key.val $search_val ";
	    }
        else
		switch(isset($GLOBALS["REV_BT"][$key]) ? $GLOBALS["REV_BT"][$key] : "SHORT"){
			case "DATE":
				$is_date = TRUE;
			case "DATETIME":
				if($value != "%")
					$value = Format_Val($GLOBALS["BT"][$GLOBALS["REV_BT"][$key]], $value);
			case "NUMBER":
			case "SIGNED":
			    # We might get a range as "100-500" for between 100 and 500
				if((strpos($value, '..') > 0) && (isset($filter["FR"]) || !isset($filter["TO"]))){
				    $tmp = explode("..", $value);
				    if(is_numeric(str_replace(" ", "", $tmp[0])) && is_numeric(str_replace(" ", "", $tmp[1]))){
				        $valFrom = (double)str_replace(" ", "", $tmp[0]);
				        $valTo = (double)str_replace(" ", "", $tmp[1]);
				        
				        $value = "BETWEEN $valFrom AND $valTo";
    					if($key == $cur_typ)
    						$GLOBALS["where"] .= " AND vals.val $value ";
    					else
    					{
    						if($join)
    							$GLOBALS["join"] .= " JOIN $z a$key ON a$key.up=vals.id AND a$key.t=$key ";
    						$GLOBALS["where"] .= " AND a$key.val $value ";
    					}
    					break;
				    }
				}
			    # We might get a statement here, thus check if we got no letters and stuff
			    if((double)str_replace(" ", "", $value) != 0)
    			    $value = str_replace(" ", "", $value);
				# Check if we got only one range border, and then transform it into an exact match
				if((!isset($filter["TO"])) || (!isset($filter["FR"])) || ($value === "%")){
					if($key == $cur_typ)
					{
					    if(isset($in))
							$GLOBALS["where"] .= " AND vals.val $search_val ";
					    elseif(isset($inID))
							$GLOBALS["where"] .= " AND vals.id $search_val ";
						elseif(strpos($value, "%") === FALSE)
							$GLOBALS["where"] .= " AND vals.val$NOT_EQ$EQ'$value' ";
						else
							$GLOBALS["where"] .= " AND vals.val $NOT LIKE '$value' ";
					}
					else
					{
					    $joinTable = "LEFT JOIN $z a$key ON a$key.up=vals.id AND a$key.t=$key";
						if($join && (strpos($GLOBALS["join"], $joinTable) === FALSE))
							$GLOBALS["join"] .= " $joinTable ";
						if($value == "%")
							$GLOBALS["where"] .= " AND a$key.val $search_val ";
						elseif(strpos($value, "%") === FALSE)
						{
							if($NOT_flag) # No match or empty
							{
							    if(isset($in))
            						$GLOBALS["where"] .= " AND (a$key.val $search_val OR a$key.val IS NULL)";
        					    elseif(isset($inID))
            						$GLOBALS["where"] .= " AND (a$key.id $search_val OR a$key.id IS NULL)";
							    else
    								$GLOBALS["where"] .= " AND (a$key.val!='$value' OR a$key.val IS NULL) ";
							}
							else
							    if(isset($in))
            						$GLOBALS["where"] .= " AND a$key.val $search_val ";
        					    elseif(isset($inID))
            						$GLOBALS["where"] .= " AND a$key.id $search_val ";
							    elseif(is_numeric($value))
    								$GLOBALS["where"] .= " AND a$key.val$NOT_EQ$EQ$value ";
							    else
    								$GLOBALS["where"] .= " AND a$key.val='$value' ";
						}
						elseif($NOT_flag) # No match or empty
							$GLOBALS["where"] .= " AND (a$key.val NOT LIKE '$value' OR a$key.val IS NULL) ";
						else
							$GLOBALS["where"] .= " AND a$key.val LIKE '$value' ";
					}
				}
				else # Apply range filter
				{
					if($is_date)
						$value = "'$value'"; # Add quotes to the date to use the index
					elseif((strpos($value, "[") === FALSE) && (strpos($value, "_") === FALSE))	# It's not a Variable
						$value = (float)str_replace(" ", "", $value); # Remove spaces from numbers

					if($f == "FR")  # Range FROM
					{
						if($key == $cur_typ)
							$GLOBALS["where"] .= " AND vals.val>=$value ";
						else{
						    $joinTable = "JOIN $z a$key ON a$key.up=vals.id AND a$key.t=$key";
							if($join && (strpos($GLOBALS["join"], $joinTable) === FALSE))
								$GLOBALS["join"] .= " $joinTable ";
						    if(($GLOBALS["REV_BT"][$key] === "NUMBER") || ($GLOBALS["REV_BT"][$key] === "SIGNED"))
    							$GLOBALS["where"] .= " AND CAST(a$key.val as FLOAT)>=CAST($value as FLOAT) ";
    						else
    							$GLOBALS["where"] .= " AND a$key.val>=$value ";
						}
					}
					elseif($f == "TO")     # Range TO
					{
						if($key == $cur_typ)
							$GLOBALS["where"] .= " AND vals.val<=$value ";
						else
							$GLOBALS["where"] .= " AND a$key.val<=$value ";
					}
				}
				break;
			default:	# Cast as SHORT in case no type detected
				if($key == $cur_typ)		# Filter was applied to the Object's Value
					$GLOBALS["where"] .= " AND vals.val $search_val ";
				else{
    				if($GLOBALS["REV_BT"][$key] == "ARRAY")
    					$GLOBALS["distinct"] = "DISTINCT"; # Array might return multiple rows, so we have to remove the dupes
				    $joinTable = "LEFT JOIN $z a$key ON a$key.up=vals.id AND a$key.t=$key";
					if($join && (strpos($GLOBALS["join"], $joinTable) === FALSE))
						$GLOBALS["join"] .= " $joinTable ";
					if($NOT_flag)
						$GLOBALS["where"] .= " AND (a$key.val $search_val OR a$key.val IS NULL)";
					else
						$GLOBALS["where"] .= " AND a$key.val $search_val ";
				}
				break;
		}
	}
}
# Construct WHERE to apply mask
function Fetch_WHERE_for_mask($t, $val, $mask){
	if(isset($GLOBALS["where"]))
		$GLOBALS["where"] = "";
	Construct_WHERE($t, array("F" => $mask), 1, FALSE); # Fake parent table =1 to make field look like "a$t.val"
	# Remove beginning " AND " from the condition built and replace the field name
	return preg_replace("/a$t\.(val|id)/", is_null($val) ? "NULL" : "'".addslashes($val)."'", substr($GLOBALS["where"], 5));
}
# Check Req val granted by mask
function Val_barred_by_mask($t, $val){
	if(isset($GLOBALS["GRANTS"]["mask"][$t])){	# Mask grants with level definition has a higher priority
	    trace("Mask set for $t");
		foreach($GLOBALS["GRANTS"]["mask"][$t] as $grant => $mask){
    	    trace(" Mask: $grant => $mask");
		    if($mask === ""){
		        $reqMask = TRUE;
    			$mask = Fetch_WHERE_for_mask($t, $val, $grant);
    			if($row = mysqli_fetch_array(Exec_sql("SELECT $mask", "Apply mask")))
    				if($row[0])
    				    return FALSE;
    		}
    		else{
    			$mask = Fetch_WHERE_for_mask($t, $val, $mask);
    			if($row = mysqli_fetch_array(Exec_sql("SELECT $mask", "Apply mask")))
    				if($row[0])
    					return ($grant != "WRITE");	# Invert what's granted
    		}
		}
		if(isset($reqMask))
	        my_die(t9n("[RU]Нет доступа к по маске реквизита![EN]This req is not granted by mask")." ($t)");
	}
	return FALSE;
}
# Check Req val granted
function Check_Val_granted($t, $val, $id=0){
	if(isset($GLOBALS["GRANTS"]["mask"][$t])){
		foreach($GLOBALS["GRANTS"]["mask"][$t] as $mask => $level)
		    if($level !== ""){
    			if(!strlen($val))
    				if($mask == "!%"){	# Empty val granted
    				    if($level === "BARRED"){
    				        $ok = "BARRED";
        					break;
    				    }
        				else
        					$ok = $level;
    				}
    				else
    					continue;
    			if(substr($mask, 0, 1) === "@"){
    			    trace("ID granted ($id) ($mask)");
    				if(((int)$id === (int)substr($mask, 1)) || ((int)$id === 0)){	# ID granted
    				    if($level !== "BARRED"){
    				        $ok = "BARRED";
        					break;
    				    }
    					break;
    				}
    				else
    					continue;
    			}
    			$mask = Fetch_WHERE_for_mask($t, $val, $mask);
    			if($mask === "")
        			return;
    			if($row = mysqli_fetch_array(Exec_sql("SELECT $mask", "Apply granted mask")))
    				if($row[0])
    				    if($level === "BARRED"){
    				        $ok = "BARRED";
        					break;
    				    }
    				    else
        					$ok = $level;
		    }
		if(!isset($ok))
		    return isset($GLOBALS["GRANTS"][$t]) ? isset($GLOBALS["GRANTS"][$t]) : "BARRED";
		if($ok === "BARRED")
    		my_die(t9n("[RU]У вас нет доступа к этому объекту ($val))![EN]You do not have this object granted ($val))")." ($t)");
    	return $ok;
	}
}
function Check_Types_Grant($fatal=TRUE)	# $fatal stops the script on no access
{
	if($GLOBALS["GLOBAL_VARS"]["user"] == "admin")
		return "WRITE";
	elseif(isset($GLOBALS["GRANTS"][0]))
	    if(($GLOBALS["GRANTS"][0] == "READ") || ($GLOBALS["GRANTS"][0] == "WRITE"))
		    return $GLOBALS["GRANTS"][0];
	if($fatal)
		die($GLOBALS["GLOBAL_VARS"]["role"].": ".t9n("[RU]У вас нет прав на редактирование и просмотр типов ([EN]You do not have the grant to view and edit the metadata (")
		    .(isset($GLOBALS["GRANTS"][0])?isset($GLOBALS["GRANTS"][0]):"").").");
}
function IsOccupied($id)
{
	global $z;
	if($row = mysqli_fetch_array(Exec_sql("SELECT 1 FROM $z WHERE id=$id", "Check if ID is occupied")))
	    return true;
	return false;
}
function my_die($msg)
{
	if(isset($GLOBALS["TRACE"]))
	{
		print_r($GLOBALS["GRANTS"]);
		print_r($GLOBALS["CUR_VARS"]);
		print($GLOBALS["TRACE"]);
	}
	if(isApi())
	    die("[{\"error\":\"$msg\"}]");
	else
    	die($msg);
	#die($msg.BACK_LINK);
}
# Check grants to the object
function Check_Grant($id, $t=0, $grant="WRITE", $fatal=TRUE)	# $fatal stops the script on no access
{
	global $z;
	if($GLOBALS["GLOBAL_VARS"]["user"] == "admin")
		return TRUE;
	elseif(isset($GLOBALS["GRANTS"][$t])&&($t!=0))
	{
	    trace("  Explicit grant to the Object $t: ".$GLOBALS["GRANTS"][$t]);
		if(($GLOBALS["GRANTS"][$t] == $grant) # Explicit grant to the Object
					|| ($GLOBALS["GRANTS"][$t] == "WRITE"))  # Requested or WRITE (higher)
			return TRUE;
		if(!$fatal)
			return FALSE;
		my_die(t9n("[RU]У вас нет доступа к реквизиту объекта $id, $t (".$GLOBALS["GRANTS"][$t]
			            .") или его родителю ".$id." (".$GLOBALS["GRANTS"][$id]."). Ваш глобальный доступ: '"
			        ."[EN]The object is not granted  $id, $t (".$GLOBALS["GRANTS"][$t]
			            .") neither its parent ".$id." (".$GLOBALS["GRANTS"][$id]."). The access level is: '")
			.$GLOBALS["GRANTS"][1]."'");
	}
	elseif(isset($GLOBALS["GRANTS"][$id]))
	{
		if(($GLOBALS["GRANTS"][$id] == $grant) # Explicit grant to the Parent
					|| ($GLOBALS["GRANTS"][$id] == "WRITE"))  # Requested or WRITE (higher)
			return TRUE;
		if(!$fatal)
			return FALSE;
		my_die(t9n("[RU]У вас нет доступа к реквизиту объекта $id, $t (".$GLOBALS["GRANTS"][$t]
			            .") или его родителю ".$id." (".$GLOBALS["GRANTS"][$id]."). Ваш глобальный доступ: '"
			        ."[EN]The object is not granted  $id, $t (".$GLOBALS["GRANTS"][$t]
			            .") neither its parent ".$id." (".$GLOBALS["GRANTS"][$id]."). The access level is: '")
			.$GLOBALS["GRANTS"][1]."'");
	}
	elseif($t == 0)
		$data_set = Exec_sql("SELECT obj.t, COALESCE(par.t, 1) par_typ, COALESCE(par.id, 1) par_id, COALESCE(arr.id, -1) arr, obj.val ref
								FROM $z obj LEFT JOIN $z par ON obj.up>1 AND par.id=obj.up 
									LEFT JOIN $z arr ON arr.up=par.t AND arr.t=obj.t
								WHERE obj.id=".(int)$id." LIMIT 1", "Get Object info by ID");
	elseif($id != 1)
		$data_set = Exec_sql("SELECT obj.t, COALESCE(par.t, 1) par_typ, COALESCE(par.id, 1) par_id, COALESCE(arr.id, -1) arr, -1 ref
								FROM $z obj JOIN $z par ON obj.up>1 AND (par.t=obj.up OR par.id=obj.up)
									LEFT JOIN $z arr ON arr.up=par.t AND arr.t=obj.t
								WHERE par.id=".(int)$id." AND (obj.t=".(int)$t." OR obj.id=".(int)$t.") LIMIT 1", "Get Object info by Parent&Type");
	else
		$data_set = Exec_sql("SELECT ".(int)$t." t, 1 par_typ, 1 par_id, -1 arr, -1 ref", "Get 1st level Object");
#print_r($GLOBALS); die();

	if($row = mysqli_fetch_array($data_set))
	{
		if(isset($GLOBALS["GRANTS"][$row["t"]]))  # Explicit something for the Object
		{
			if(($GLOBALS["GRANTS"][$row["t"]] == $grant) # Explicit grant to the Object
					OR ($GLOBALS["GRANTS"][$row["t"]] == "WRITE"))  # Requested or WRITE (higher)
				return TRUE;
		}
		elseif(isset($GLOBALS["GRANTS"][$row["arr"]]))  # This is an array member
		{
			if(($GLOBALS["GRANTS"][$row["arr"]] == $grant) # Explicit grant to the Array
					OR ($GLOBALS["GRANTS"][$row["arr"]] == "WRITE"))  # Requested or WRITE (higher)
				return TRUE;
		}
		elseif(isset($GLOBALS["GRANTS"][$row["ref"]]) && ($row["t"] != REP_COLS) && ($row["t"] != ROLE_OBJECT))  # This is a granted Ref attribute
		{
			if(($GLOBALS["GRANTS"][$row["ref"]] == $grant) # Explicit grant to the Ref
					OR ($GLOBALS["GRANTS"][$row["ref"]] == "WRITE"))  # Requested or WRITE (higher)
				return TRUE;
		}
		elseif(isset($GLOBALS["GRANTS"][$row["par_typ"]]))  # Explicit something for the Parent
		{
			if(($GLOBALS["GRANTS"][$row["par_typ"]] == $grant) # Explicit grant to the Parent
					OR ($GLOBALS["GRANTS"][$row["par_typ"]] == "WRITE"))  # Requested or WRITE (higher)
				return TRUE;
		}
		elseif(isset($GLOBALS["GRANTS"][$row["par_id"]]))  # Explicit something for the Parent's type
		{
			if(($GLOBALS["GRANTS"][$row["par_id"]] == $grant) # Explicit grant to the Parent's type
					OR ($GLOBALS["GRANTS"][$row["par_id"]] == "WRITE"))  # Requested or WRITE (higher)
				return TRUE;
		}
		elseif($row["par_id"] > 1)  # Until we get to the ROOT
			if(Check_Grant($row["par_id"], 0, $grant, FALSE)) # Dig further recursively
				return TRUE;
	}
	if($fatal)
		my_die(t9n("[RU]У вас нет доступа к реквизиту объекта: $id, $t (".$GLOBALS["GRANTS"][$row["t"]]
			    .") или его родителю ".$row["par_id"]." (".$GLOBALS["GRANTS"][$row["par_typ"]]
			    .")! Ваш глобальный доступ: '".$GLOBALS["GRANTS"][1]
			."'.[EN]The object is not granted: $id, $t (".$GLOBALS["GRANTS"][$row["t"]].")neither its parent "
			    .$row["par_id"]." (".$GLOBALS["GRANTS"][$row["par_typ"]].")! The access level is: '".$GLOBALS["GRANTS"][1]."'"));
	return FALSE;
}
# Check Grants for ROOT's children
function Grant_1level($id)  # Check READ grant on the object
{
    global $z;
	if($GLOBALS["GLOBAL_VARS"]["user"] == "admin")
		return "WRITE";
	elseif(isset($GLOBALS["GRANTS"][$id]))  # Explicit rights
	{
		if(($GLOBALS["GRANTS"][$id] == "READ") || ($GLOBALS["GRANTS"][$id] == "WRITE"))
			return $GLOBALS["GRANTS"][$id];  # Granted
	}
	elseif(isset($GLOBALS["GRANTS"][1]))  # ROOT rights defined
		if(($GLOBALS["GRANTS"][1] == "READ") || ($GLOBALS["GRANTS"][1] == "WRITE"))
			return $GLOBALS["GRANTS"][1];  # ROOT rights granted
		
	$data_set = Exec_sql("SELECT req.up FROM $z ref LEFT JOIN $z req ON req.t=ref.id WHERE ref.t=$id AND ref.up=0"
	                        , "Check grants to parent of this as ref");
	while($row = mysqli_fetch_array($data_set))
	    if(isset($GLOBALS["GRANTS"][$row["up"]]))
    	    if(($GLOBALS["GRANTS"][$row["up"]] == "READ") || ($GLOBALS["GRANTS"][$row["up"]] == "WRITE"))
    	        return "READ";
	
	return FALSE;
}
function Validate_Token(){ # Validates the cookie token and gathers the user permissions
	global $z, $blocks;
	$GLOBALS["GRANTS"] = array();
	if(isset($_POST["secret"])){
		$tok = addslashes($_POST["secret"]);
		$typ = SECRET;
		setcookie($z, $tok, 0, "/");  # The cookie to be deleted upon the session close
	}
	elseif(isset($_GET["secret"])){
		$tok = addslashes($_GET["secret"]);
		$typ = SECRET;
		setcookie($z, $tok, 0, "/");  # The cookie to be deleted upon the session close
	}
	elseif(isset($_POST["token"])){
        $tok = htmlentities($_POST["token"]);
		$typ = TOKEN;
	}
	elseif(isset($_COOKIE[$z])){
		$tok = addslashes($_COOKIE[$z]);
		$typ = TOKEN;
	}
	elseif(isApi()){
		foreach(getallheaders() as $key => $value){
	        $value = htmlentities($value);
    		if((strtolower($key) === "authorization") || (strtolower($key) === "x-authorization")){
    		    if(strtolower(substr($value, 0, 5)) === "basic"){  // Basic HTML authorization
        		    $value = trim(substr($value, 5));
        		    if(strpos($value, ":") === FALSE)
                        $value = base64_decode($value);
        		    $tmp = explode(":", $value);
                    $u = $tmp[0];
                    $pwd = sha1(Salt($u, $tmp[1]));
            		$data_set = Exec_sql("SELECT tok.val tok, u.id FROM $z pwd, $z u"
            									." LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN
            								." WHERE u.t=".USER." AND u.val='$u' AND pwd.up=u.id AND pwd.val='$pwd'"
            						, "Basic authentication");
            		if($row = mysqli_fetch_array($data_set)){
            		    if(isset($row["tok"]))
                    		$tok = $row["tok"];
                    	else
                    	    insert($row["id"], 1, TOKEN, $tok = $pwd, "Save basic token");
            		}
                	else{
            	        header("HTTP/1.0 401 Unauthorized");
            		    die("[{\"error\":\"Basic auth: Invalid login/password (login:$u)\"}]");
                	}
    		    }
    		    elseif(strtolower(substr($value, 0, 6)) === "bearer")  // Bearer-token
        		    $tok = trim(substr($value, 6));
    		    else // Auth token
            		$tok = htmlentities($value);
        		break;
    		}
		}
		$typ = TOKEN;
		if(!isset($tok)){
	        header("HTTP/1.0 401 Unauthorized");
		    die("[{\"error\":\"No authorization token provided\"}]");
		}
	}

    if(isset($tok)){
		$data_set = Exec_sql("SELECT u.id, u.val, role_def.id r, role_def.val role, xsrf.val xsrf, tok.id tok, xsrf.id xsrf_id, act.id act_id
		                FROM $z tok, $z u LEFT JOIN ($z r CROSS JOIN $z role_def) ON r.up=u.id AND role_def.id=r.t AND role_def.t=".ROLE
						." LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=".XSRF
						." LEFT JOIN $z act ON act.up=u.id AND act.t=".ACTIVITY
						." WHERE u.t=".USER." AND tok.up=u.id AND tok.val='$tok' AND tok.t=$typ", "Validate token");
		if($row = mysqli_fetch_array($data_set)){
			$GLOBALS["GLOBAL_VARS"]["user"] = strtolower($row["val"]);
			$GLOBALS["GLOBAL_VARS"]["role"] = strtolower($row["role"]);
			$GLOBALS["GLOBAL_VARS"]["role_id"] = $row["r"];
			$GLOBALS["GLOBAL_VARS"]["user_id"] = $row["id"];
			$xsrf = $row["xsrf"];
			if(!$row["r"])
				my_die(t9n("[RU]Пользователю ".$GLOBALS["GLOBAL_VARS"]["user"]." не задана роль"
				        ."[EN]No role assigned to user ".$GLOBALS["GLOBAL_VARS"]["user"]));
			if($row["act_id"])
                Exec_sql("UPDATE $z SET val=".microtime(TRUE)." WHERE id=".$row["act_id"], "Update activity time", FALSE);
            else
                Exec_sql("INSERT INTO $z (up, ord, t, val) VALUES (".$row["id"].",0,".ACTIVITY.",".microtime(TRUE).")", "Set activity time", FALSE);
            if($typ === SECRET){
        		setcookie($z, "", time() - 3600, "/");  # Remove the password cookie
            	if(!$row["xsrf"])
            		Insert($row["id"], 1, XSRF, $xsrf=xsrf($tok, $GLOBALS["GLOBAL_VARS"]["user"]), "Save xsrf for secret");
        		$data_tok = Exec_sql("SELECT tok.id FROM $z tok WHERE tok.t=".TOKEN." AND tok.up=".$row["id"], "Check if token exists");
        		if(!mysqli_fetch_array($data_tok))
            		Insert($row["id"], 1, TOKEN, $tok, "Save token for secret");
            }
            getGrants($row["r"]);
#print_r($GLOBALS); die($v." ".$attrs." ".count($blocks[$attrs][strtolower($attrs)]));
		}
		elseif((isset($_COOKIE[$z]) && $_COOKIE[$z] === sha1(ADMINHASH.$z)) || ($tok === sha1(ADMINHASH.$z))){
			$GLOBALS["GLOBAL_VARS"]["user"] = $GLOBALS["GLOBAL_VARS"]["role"] = "admin";
			$GLOBALS["GLOBAL_VARS"]["user_id"] = 0;
			$GLOBALS["GLOBAL_VARS"]["role_id"] = 145;
			$xsrf = sha1($z.ADMINHASH);
		}
		$GLOBALS["tzone"] = isset($_COOKIE["tzone"]) ? $_COOKIE["tzone"] : 0;
	}
	if(!isset($GLOBALS["GLOBAL_VARS"]["user"])){ # Check, if we got a Guest user defined
		$data_set = Exec_sql("SELECT u.id u, tok.val tok, tok.id token, xsrf.id xsrf, role_def.id r"
		                        ." FROM $z u LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN
								." LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=".XSRF
        						." LEFT JOIN ($z r CROSS JOIN $z role_def) ON r.up=u.id AND role_def.id=r.t AND role_def.t=".ROLE
    		                    ." WHERE u.t=".USER." AND u.val='guest'"
		                    , "Get Guest credentials");
#        print_r($GLOBALS);print_r($GLOBALS["TRACE"]);my_die("ok");
		if($row = mysqli_fetch_array($data_set)){
		    $tok = "gtuoeksetn";
    		if(!$row["tok"])
    			Insert($row["u"], 1, TOKEN, $tok, "Save guest token");
    		else
    		    Update_Val($row["token"], $xsrf);
			$xsrf = xsrf("gtuoeksetn", "guest");
    		if(!$row["xsrf"])
    			Insert($row["u"], 1, XSRF, $xsrf, "Save guest xsrf");
    		else
    		    Update_Val($row["xsrf"], $xsrf);
    		setcookie($z, "gtuoeksetn", time() + COOKIES_EXPIRE, "/"); # 30 days
			if(isApi()){
                getGrants($row["r"]);
    			$GLOBALS["GLOBAL_VARS"]["user"] = "guest";
    			$GLOBALS["GLOBAL_VARS"]["user_id"] = $row["u"];
            	$GLOBALS["GLOBAL_VARS"]["xsrf"] = $xsrf;
                $GLOBALS["GLOBAL_VARS"]["token"] = $tok;
            	return isset($GLOBALS["GLOBAL_VARS"]["user"]);
			}
    		header("Location: ".$_SERVER["REQUEST_URI"]);
            die();
		}
        elseif(isApi()){
	        header("HTTP/1.0 401 Unauthorized");
            my_die(t9n("[RU]Ошибка авторизации $z"."[EN]Authentication failed in $z"));
        }
		elseif($z === "my" && isset($_GET["login"])){
		    if(isset($_COOKIE[$_GET["login"]])){
        		$data_set = Exec_sql("SELECT u.val FROM ".addslashes($_GET["login"])." tok, ".addslashes($_GET["login"])." u"
            						." WHERE u.t=".USER." AND tok.up=u.id AND tok.val='".addslashes($_COOKIE[$_GET["login"]])."' AND tok.t=".TOKEN
            					, "Validate token for cabinet");
            	#die("SELECT u.val FROM $z tok, $z u"." WHERE u.t=".USER." AND tok.up=u.id AND tok.val='".addslashes($_COOKIE[$_GET["login"]])."' AND tok.t=".TOKEN);
        		if($row = mysqli_fetch_array($data_set)){
            		#login($z, "", "login");
            		$data_set = Exec_sql("SELECT tok.val FROM $z db, $z u LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN
                						." WHERE u.t=".USER." AND db.up=u.id AND db.val='".$row["val"]."' AND db.t=".DATABASE
                					, "Seek cabinet");
            		if($row = mysqli_fetch_array($data_set)){
                		setcookie($z, $row["val"], time() + 2592000*12, "/"); # 12*30 days
                		login($z, "", "reenter");
            		}
        		}
	    	}
		}
		elseif(isset($_COOKIE["my"])){ // Log in the DB using the cabinet's token
    		$data_set = Exec_sql("SELECT u.val FROM my tok, my u, my db"
        						." WHERE u.t=".USER." AND tok.up=u.id AND tok.val='".addslashes($_COOKIE["my"])."' AND tok.t=".TOKEN
        						    ." AND db.val='$z' AND db.up=u.id AND db.t=".DATABASE
        					, "Validate token for cabinet");
    		if($row = mysqli_fetch_array($data_set)){
        		$data_set = Exec_sql("SELECT tok.val FROM $z u, $z tok WHERE u.t=".USER." AND tok.up=u.id AND u.val='$z' AND tok.t=".TOKEN
            					, "Get token in current db");
        		if($row = mysqli_fetch_array($data_set)){
            		setcookie($z, $row["val"], time() + 2592000*12, "/"); # 12*30 days
            		login($z, "", "reenter");
        		}
    		}
		}
		login($z, "", "InvalidToken");
        die();
	}
	$GLOBALS["GLOBAL_VARS"]["xsrf"] = isset($xsrf) ? $xsrf : xsrf($_SERVER["REMOTE_ADDR"], "guest");
    $GLOBALS["GLOBAL_VARS"]["token"] = $tok;
	return isset($GLOBALS["GLOBAL_VARS"]["user"]);  # Return TRUE in case the token is OK
}
function getGrants($r){
    global $z, $blocks;
	$data_set = Exec_sql("SELECT gr.val obj, COALESCE(def.val, '') lev, mask.val mask, exp.val exp, del.val del FROM $z gr"
                        ."	LEFT JOIN ($z lev CROSS JOIN $z def) ON lev.up=gr.id AND def.id=lev.t AND def.t=".LEVEL
                        ."	LEFT JOIN $z mask ON mask.up=gr.id AND mask.t=".MASK
                        ."	LEFT JOIN $z exp ON exp.up=gr.id AND exp.t=".EXPORT
                        ."	LEFT JOIN $z del ON del.up=gr.id AND del.t=".DELETE
						." WHERE gr.up=$r AND gr.t=".ROLE_OBJECT, "Get grants");
	while($row = mysqli_fetch_array($data_set)){
		if(preg_match("/(\[.+\])/", $row["mask"], $builtins)){	# An expression given
			$v = BuiltIn($builtins[1]);
			if($v == $builtins[1]){	# No Built in for this
				$attrs = substr($v, 1, strlen($v) - 2);
				Get_block_data($attrs);
				if(isset($blocks[$attrs][mb_strtolower($attrs)])){
					if(count($blocks[$attrs][mb_strtolower($attrs)]))
						$v = array_shift($blocks[$attrs][mb_strtolower($attrs)]);
				}
				elseif(isset($blocks[$attrs])){
				    $v = array_shift($blocks[$attrs]);
				    $v = array_shift($v);
				}
			}
			$v = preg_replace("/(\[.+\])/", $v, $row["mask"]);
		}
		else
			$v = "".$row["mask"];
		if(strlen($row["lev"]))
    		$GLOBALS["GRANTS"][$row["obj"]] = $row["lev"];
		if(strlen($v))
			$GLOBALS["GRANTS"]["mask"][$row["obj"]][$v] = $row["lev"];
		if(strlen($row["exp"]))
			$GLOBALS["GRANTS"]["EXPORT"][$row["obj"]] = "1";
		if(strlen($row["del"]))
			$GLOBALS["GRANTS"]["DELETE"][$row["obj"]] = "1";
	}
	if(isset($GLOBALS["TRACE"]) && isset($GLOBALS["GRANTS"]))
		trace(print_r($GLOBALS["GRANTS"], TRUE));
}
function Get_Align($typ){
	switch($GLOBALS["REV_BT"][$typ]){
		case "PWD":
		case "DATE":
		case "BOOLEAN":
			return "CENTER";
		case "NUMBER":
		case "SIGNED":
			return "RIGHT";
	}
	return "LEFT";
}
function Format_Val($typ, $val){
	global $z;
	if($val != "NULL"){
		if(!isset($GLOBALS["REV_BT"][$typ]))
			if($typ != 0)
				if($row = mysqli_fetch_array(Exec_sql("SELECT t FROM $z WHERE id='.addslashes($typ).'", "Get Typ for Format")))
				    if(isset($GLOBALS["REV_BT"][$row["t"]]))
    					$GLOBALS["REV_BT"][$typ] = $GLOBALS["REV_BT"][$row["t"]];
        if(isset($GLOBALS["REV_BT"][$typ]))
            switch($GLOBALS["REV_BT"][$typ]){
    			case "DATE":
    				if(($val != "") && (substr($val, 0, 1) != "[") && (substr($val, 0, 10) != "_request_."))
    				{
    				    $val = trim($val);
    				    if(preg_match("/^([0-9]{4})[-\/\.]?([0-9]{2})[-\/\.]?([0-9]{2})/", $val, $date))
        					$val = $date[1].$date[2].$date[3]; // ISO YYYY[/-.]MM[/-.]DD
    				    else
    				    {
        					$v = explode("/", str_replace(".", "/", str_replace(",", "/", str_replace(" ", "/", $val))));
        					$dy = (isset($v[2])) ? (int)((strlen($v[2])==4) ? $v[2] : 2000+$v[2]) : date("Y");
        					$dm = isset($v[1]) ? (int)$v[1] : date("m");
        					$dd = (int)$v[0];
        					if(!checkdate($dm, $dd, $dy))
        						$GLOBALS["warning"] = $GLOBALS["warning"] ?: $GLOBALS["warning"].t9n("[RU]Неверная дата[EN]Wrong date")." $val!<br>";
        					$val = $dy.substr("0". $dm, -2).substr("0".$dd, -2);
    				    }
    				}
    				break;
    			case "NUMBER":
    				$v = (int)str_replace(",", ".", str_replace(" ", "", $val));
    				if($v != 0)
    					$val = $v;
    				break;
    			case "BOOLEAN":
    			    if(($val === "") || (strtolower($val) === "false") || ($val === "-1") || ($val === " "))
    					$val = "";
    				else
    					$val = "1";
    				break;
    			case "SIGNED":
    				$v = (double)str_replace(",", ".", str_replace(array(" ", chr(0xC2).chr(0xA0)), "", $val));
    				if($v != 0)
    					$val = $v;
    				break;
    			case "DATETIME":
    				if(($val != "") && (substr($val, 0, 1) != "[")){
    				    $val = trim($val);
    				    if(preg_match("/^\d{4}.\d{2}.\d{2}/", $val))
        				    $val = preg_replace("/^(\d{4})(.)(\d{2})(.)(\d{2})/", "$5.$3.$1", $val);
    					if($val > 10000)	# Timestamp is OK
    						$val = (int)$val - $GLOBALS["tzone"];
    					elseif(strtotime($val) < 10000)	# An inadequate Timestamp & non-valid string time
    						$val = strtotime(Format_Val($GLOBALS["BT"]["DATE"], $val)) - (int)$GLOBALS["tzone"];	# Try to apply DATE validation
    					else
    						$val = strtotime($val) - (int)$GLOBALS["tzone"];
    				}
    				break;
    		}
	}
	return $val;
}
function Format_Val_View($typ, $val, $id=0)
{
    if($val === "")
        return $val;
    #trace("format val $val ($typ) of ".$GLOBALS["REV_BT"][$typ]);
	global $z;
	if($val != "NULL" && isset($GLOBALS["REV_BT"][$typ]))
		switch($GLOBALS["REV_BT"][$typ])
		{
			case "DATE":
				if($val != "")
				{
					if(strlen($val) > 8)	# This might be DATETIME
						$val = date("d.m.Y", $val + $GLOBALS["tzone"]);	# Microtime
					else
						$val = substr($val, 6, 2).".".substr($val, 4, 2).".".substr($val, 0, 4);
				}
				break;
			case "DATETIME":
				$val = date("d.m.Y H:i:s", (int)$val + $GLOBALS["tzone"]);	# Microtime
				break;
			case "BOOLEAN":
				if($val != "")
					$val = "X";
				break;
			case "NUMBER":
				if($val != 0)
					$val = number_format(floatval($val), 0, "", "");
				break;
			case "FILE":
			    if(strpos($val,":")){
    			    $id = substr($val, 0, strpos($val,":"));
                    $val = "<a target=\"_blank\" href=\"/".GetSubdir($id)."/".GetFilename($id).".".substr(strrchr($val,'.'),1)."\">".substr($val,strpos($val,":")+1)."</a>";
			    }
			    else
                    $val = "<a target=\"_blank\" href=\"/".GetSubdir($id)."/".GetFilename($id).".".substr(strrchr($val,'.'),1)."\">$val</a>";
				break;
			case "SIGNED":
				if($val == "")
					break;
				$v = explode(".",trim($val));
				$val = trim(number_format(floatval($v[0]), 0, ".", "") . "." . substr((isset($v[1])?$v[1]:"")."00", 0, max(2,strlen((isset($v[1])?$v[1]:0)))));
				break;
			case "PATH":
			    $id = substr($val,0,strpos($val,":"));
				$val = "/".GetSubdir($id)."/".GetFilename($id).".".substr(strrchr($val,'.'),1);
				break;
			case "GRANT":
				if($val == 0)
					return TYPE_EDITOR;
				if($val == 1)
					return ALL_OBJECTS;
				if($val == 10)
					return FILES;
	# Attention: no break here!		
			case "REPORT_COLUMN":
				if($val == "0") # A synthetic field
					$GLOBALS["REP_COLS"][$val] = CUSTOM_REP_COL;
				elseif($val == 0) # Symbolic non-standard (grants for ROOT, EDIT_TYPES, etc)
					$GLOBALS["REP_COLS"][$val] = $val;
				elseif(!isset($GLOBALS["REP_COLS"][$val]))
				{
					$sql = "SELECT a.id, a.val, reqs.id req_id, refs.val req_val, reqs.val attr, ref_vals.val ref_val
							FROM $z a LEFT JOIN ($z reqs CROSS JOIN $z refs) ON refs.id=reqs.t AND reqs.up=a.id
								LEFT JOIN $z ref_vals ON ref_vals.id=refs.t AND ref_vals.id!=ref_vals.t
							WHERE a.id=COALESCE((SELECT up FROM $z WHERE id=$val AND up!=0), $val)";
					$data_set = Exec_sql($sql, "Get Report Columns for View");
					while($row = mysqli_fetch_array($data_set))
					{
						if(!isset($GLOBALS["REP_COLS"][$row["id"]]))
							$GLOBALS["REP_COLS"][$row["id"]] = $row["val"];
						if(!isset($GLOBALS["REP_COLS"][$row["req_id"]]))
							if(strlen($row["ref_val"]))
							{
								$alias = FetchAlias($row["attr"], $row["ref_val"]);
								if($alias == $row["ref_val"])
									$GLOBALS["REP_COLS"][$row["req_id"]] = $row["val"]." -> ".$row["ref_val"];
								else
									$GLOBALS["REP_COLS"][$row["req_id"]] = $row["val"]." -> $alias (".$row["ref_val"].")";
							}
							else
								$GLOBALS["REP_COLS"][$row["req_id"]] = $row["val"]." -> ".$row["req_val"];
					}
				}
				$val = $GLOBALS["REP_COLS"][$val];
				break;
			case "PWD":
				$val = strlen($val) ? PASSWORDSTARS : "";
				break;
		}
	return $val;
}

function Get_file($file, $fatal=TRUE) # $fatal - Die if not found
{
	global $z;
	if(!isset($file))
		die ("Set file name!");

	if(is_file($_SERVER['DOCUMENT_ROOT']."/templates/custom/$z/$file"))  # Search DB folder
		$file = $_SERVER['DOCUMENT_ROOT']."/templates/custom/$z/$file";
	elseif(is_file($_SERVER['DOCUMENT_ROOT']."/templates/$file"))  # Search common folder
		$file = $_SERVER['DOCUMENT_ROOT']."/templates/$file";
	elseif($fatal)
		die ("File [$file] does not exist!");
	else
		return "";

	if(!($fh = fopen($file, "r")))
		die(t9n("[RU]Не удается открыть файл:[$file][EN]Cannot open file: [$file]"));

	$file_text = fread($fh, filesize($file));
	fclose($fh);
	return $file_text;
}
function Delete($id, $root=TRUE)  # Delete Obj and its children recursively
{
	global $z;
	$children = exec_sql("SELECT id FROM $z WHERE up=$id", "Get children");
	if($child=mysqli_fetch_array($children))
	{
		do
		{
			Delete($child["id"], FALSE);  # FALSE mean don't drop the object itself, just kill Reqs
		} while($child=mysqli_fetch_array($children));
		Exec_sql("DELETE FROM $z WHERE up=$id", "Delete reqs");
	}
	if($root) # Delete the object in case it's the initially requested one
		Exec_sql("DELETE FROM $z WHERE id=$id", "Delete obj");
}
function BatchDelete($id, $root=TRUE)  # Delete Obj and its children recursively
{
	global $z;
	if($id === "")
	{
    	if(isset($GLOBALS["BatchUps"]))
    	{
    		Exec_sql("DELETE FROM $z WHERE up IN(".$GLOBALS["BatchUps"].")", "Flush ups");
            unset($GLOBALS["BatchUps"]);
    	}
    	if(isset($GLOBALS["BatchIDs"]))
    	{
    		Exec_sql("DELETE FROM $z WHERE id IN(".$GLOBALS["BatchIDs"].")", "Flush objs");
            unset($GLOBALS["BatchIDs"]);
    	}
        return;
	}
    trace(" get children for $id");
	$children = exec_sql("SELECT del.id, MIN(child.up) child FROM $z del LEFT JOIN $z child ON child.up=del.id WHERE del.up=$id GROUP BY del.id", "Get children for batch");
	if($child=mysqli_fetch_array($children))
	{
        trace(" $id has ".mysqli_num_rows($children)." children");
		do
		{
		    if($child["child"] > 0)
		    {
        		BatchDelete($child["id"], false);
            	$GLOBALS["BatchUps"] = isset($GLOBALS["BatchUps"]) ? $GLOBALS["BatchUps"].",".$child["id"] : $child["id"];
                // Flush the SQL in case the batch is big enough
            	if(strlen($GLOBALS["BatchUps"]) > 10000)
                    BatchDelete("");
		    }
		} while($child=mysqli_fetch_array($children));
    	$GLOBALS["BatchUps"] = isset($GLOBALS["BatchUps"]) ? $GLOBALS["BatchUps"].",$id" : $id;
    	if(strlen($GLOBALS["BatchUps"]) > 10000)
            BatchDelete("");
	}
    // Add the id to the batch for all its children are already on the list
	if($root) # Delete the object in case it's the initially requested one
	{
    	$GLOBALS["BatchIDs"] = isset($GLOBALS["BatchIDs"]) ? $GLOBALS["BatchIDs"].",$id" : $id;
    	if(strlen($GLOBALS["BatchIDs"]) > 10000)
            BatchDelete("");
    }
}
# Replace the built-in Definitions with exact values
# Built-ins look like [VALUE]
function BuiltIn($par)
{
	switch($par)
	{
		case "[TODAY]":  # The current date
			return date("d.m.Y", time() + $GLOBALS["tzone"]);
		case "[NOW]":  # The current datetime
			return date("d.m.Y H:i:s", time() + $GLOBALS["tzone"]);
		case "[YESTERDAY]":  # Yesterday
			return date("d.m.Y", time() - 86400 + $GLOBALS["tzone"]);
		case "[TOMORROW]":  # Tomorrow
			return date("d.m.Y", time() + 86400 + $GLOBALS["tzone"]);
		case "[MONTH_AGO]":		# Month ago
			return date("d.m.Y", strtotime("-1 months") + $GLOBALS["tzone"]);
		case "[WEEK_AGO]":		# Month ago
			return date("d.m.Y", strtotime("-1 week") + $GLOBALS["tzone"]);
		case "[MONTH_PLUS]":	# Month forward
			return date("d.m.Y", strtotime("1 months") + $GLOBALS["tzone"]);
		case "[USER]":  # Current user
			return $GLOBALS["GLOBAL_VARS"]["user"];
		case "[USER_ID]":  # Current user ID
			return $GLOBALS["GLOBAL_VARS"]["user_id"];
		case "[ROLE]":  # Current user
			return $GLOBALS["GLOBAL_VARS"]["role"];
		case "[ROLE_ID]":  # Current user
			return $GLOBALS["GLOBAL_VARS"]["role_id"];
		case "[TSHIFT]":  # User's time zone shift
			return $GLOBALS["tzone"];
		case "[REMOTE_ADDR]":  # User's IP-address
			return $_SERVER["REMOTE_ADDR"];
		case "[REMOTE_HOST]":
			return $_SERVER["REMOTE_HOST"];
		case "[HTTP_USER_AGENT]":  # User's IP-address
			return $_SERVER["HTTP_USER_AGENT"];
		case "[HTTP_REFERER]":  # User's IP-address
			return isset($_SERVER["HTTP_REFERER"]) ? $_SERVER["HTTP_REFERER"] : "";
		case "[HTTP_HOST]":  # This host's name
			return $_SERVER["HTTP_HOST"];
		case "[REQUEST_URI]":  # This host's name
			return $_SERVER["REQUEST_URI"];
	}
	return $par;  # No matches found - return as is
}
function MaskDelimiters($v)
{
    return str_replace(";", "\;", str_replace(":", "\:", str_replace("\\", "\\\\", $v)));
}
function UnMaskDelimiters($v)
{
    return str_replace("\;", ";", str_replace("\:", ":", str_replace("\\\\", "\\", UnHideDelimiters($v))));
}
function HideDelimiters($v)
{
    return str_replace("\,", "%2C", str_replace("\;", "%3B", str_replace("\:", "%3A", str_replace("\\\\", "%5C", $v))));
}
function UnHideDelimiters($v)
{
    return str_replace("%2C", "\,", str_replace("%3B", "\;", str_replace("%3A", "\:", str_replace("%5C", "\\\\", $v))));
}
function constructHeader($id, $parent=0){
	global $z;
	if(!isset($GLOBALS["local_struct"][$id])){
		$GLOBALS["parents"][$id] = $parent;
		$data_set = Exec_sql("SELECT CASE WHEN length(obj.val)=0 THEN obj.id ELSE obj.t END t, CASE WHEN length(obj.val)=0 THEN obj.t ELSE obj.val END val
		                            , req.id, req.t req_t, refr.val req, refr.t ref_t, req.val attr, base.t base_t, arr.id arr, linx.i, obj.ord uniq
								FROM $z obj LEFT JOIN ($z req CROSS JOIN $z refr CROSS JOIN $z base) ON req.up=obj.id AND refr.id=req.t AND base.id=refr.t
									LEFT JOIN $z arr ON arr.up=req.t AND arr.t!=0 AND arr.ord=1
									CROSS JOIN (SELECT count(1) i FROM $z WHERE up=0 AND t=$id) linx
								WHERE obj.id=$id ORDER BY req.ord", "Get Obj structure");
		while($row = mysqli_fetch_array($data_set)){
			if(!isset($GLOBALS["local_struct"][$id])){
				$GLOBALS["local_struct"][$id][0] = "$id:".MaskDelimiters($row["val"]).(isset($GLOBALS["REV_BT"][$row["t"]])?":".$GLOBALS["REV_BT"][$row["t"]]:"")
				                            .($row["uniq"]=="1"?":unique":"");
	            $GLOBALS["base"][$id] = $row["t"];
	            $GLOBALS["uniq"][$id] = $row["uniq"];
				if($row["i"])	# We might have refs to this object, so we need to export its ID
					$GLOBALS["linx"][$id] = "";
			}
			if($row["req_t"]){	# Do we have Reqs?
				if($row["ref_t"] != $row["base_t"]){ // This is a reference Req
				    trace("add link: ".$row["id"]." -> ".$row["req_t"]);
					$GLOBALS["local_struct"][$id][$row["id"]] = "ref:".$row["id"].":".$row["req_t"].($row["attr"]?":".MaskDelimiters($row["attr"]):"");
					if(!isset($GLOBALS["local_struct"][$row["req_t"]])) # Export ref object
						constructHeader($row["req_t"], $id);
					if(!isset($GLOBALS["local_struct"][$row["ref_t"]]))
						constructHeader($row["ref_t"], $id);
		            $GLOBALS["refs"][$row["id"]] = $row["ref_t"];
            		if(strpos($row["attr"], MULTI_MASK) !== FALSE)
            			$GLOBALS["MULTI"][$row["id"]] = $row["ref_t"];
				}
				elseif($row["arr"]){
					$GLOBALS["local_struct"][$id][$row["id"]] = "arr:".$row["req_t"].($row["attr"]?":".MaskDelimiters($row["attr"]):"");
					if(!isset($GLOBALS["local_struct"][$row["req_t"]])){
						constructHeader($row["req_t"], $id);
						$GLOBALS["arrays"][$row["req_t"]] = "";
					}
				}
				else{
					$GLOBALS["local_struct"][$id][$row["id"]] = MaskDelimiters($row["req"]).":".$GLOBALS["REV_BT"][$row["ref_t"]].($row["attr"]?":".MaskDelimiters($row["attr"]):"");
					if($GLOBALS["REV_BT"][$row["ref_t"]] == "PWD")	# Do not export PWD hashes
						$GLOBALS["pwds"][$row["id"]] = "";
		            $GLOBALS["base"][$row["id"]] = $row["base_t"];
				}
			}
		}
	}
}
function exportHeader(){
    $head_str = "";
	if(is_array($GLOBALS["local_struct"]))
		foreach($GLOBALS["local_struct"] as $value)
			$head_str .= implode(";", $value).";\r\n";
	return $head_str;
}
function exportTerms($id){
	global $z;
    trace("REP_COLS here with $id");
	$data_set = Exec_sql("SELECT obj.t type, obj.up, type.t base FROM $z obj, $z type WHERE obj.id=$id AND type.id=obj.t", "Get term");
	$GLOBALS["termDefs"][$id] = 1;
	if($row = mysqli_fetch_array($data_set))
        if($row["up"] === "0")
            trace($id." obj: ".constructHeader($id));
        else{
            trace($row["up"]." base: ".constructHeader($row["up"]));
            foreach($GLOBALS["local_struct"][$row["up"]] as $key => $value)
                if($id == $key){
                    $GLOBALS["local_struct"][$id][0] = "subst:$id:".$row["up"].":$value";
                    trace("  ".$row["up"]."- id:$id key:$key val:$value");
                }
        }
}
$exported = Array();
function Export_reqs($id, $obj, $val, $ref=""){
	global $z, $exported;
	if(isset($exported[$obj]))
	    return "";
	$exported[$obj] = "";
	$str = $children = $refs = "";
	if(!isset($GLOBALS["data"][$obj])){
		$reqs = array();
		$data_set = Exec_sql("SELECT DISTINCT obj.id, obj.t, obj.val, obj.ord, req.t req_t, req.val req_val, req.up rup, par.up ref
								FROM $z obj LEFT JOIN $z req ON req.id=obj.t LEFT JOIN $z par ON par.id=req.up
								WHERE obj.up=$obj ORDER BY obj.ord"
							, "Get Obj data $id");
		while($row = mysqli_fetch_array($data_set)){
			if(($row["t"] == REP_COLS) && ($row["val"] !== "0") && !isset($GLOBALS["local_struct"][$row["val"]]) && !isset($GLOBALS["termDefs"][$row["val"]]))
			    exportTerms($row["val"]);
			if(($row["rup"] != $id) && ($row["rup"] != 0)){
				$reqs[$row["val"]] = (isset($reqs[$row["val"]])?$reqs[$row["val"]].",":"").$row["t"];
				# Submit the Ref value in case it's a referenced object
				$refs .= Export_reqs($row["req_t"], $row["t"], MaskDelimiters($row["req_val"]), $row["ref"]==1?$row["val"].":":0);
			}
			elseif(isset($GLOBALS["arrays"][$row["t"]]))
				$children .= Export_reqs($row["t"], $row["id"], $row["val"]);
			elseif(!isset($GLOBALS["pwds"][$row["t"]]))
				$reqs[$row["t"]] = MaskDelimiters($row["val"]);
		}
		foreach($GLOBALS["local_struct"][$id] as $key => $value)
			if($key == 0)
				$str = MaskDelimiters($val).";";
			else
				$str .= isset($reqs[$key]) ? $reqs[$key].";" : ";";
		if(isset($GLOBALS["arrays"][$id]) || !isset($GLOBALS["linx"][$id])	# Array or Link values
				|| (($GLOBALS["id"] == $id) && ($_REQUEST["F_U"] > 1)))
			$str = "$id::$str\r\n";
		else	# Save the ID for we could have links to it later
		{
			$str ="$ref$id:$obj:$str\r\n";
			$GLOBALS["data"][$obj] = ""; # $str;
		}
	}
#my_die($id);
	return $refs.$str.$children; // Refs declarations go first, before the object using them 
}
function isRef($id, $par, $typ)
{
	if(isset($GLOBALS["STORED_REPS"][$id]["ref_typ"][$typ])) # Does our parent have refs?
		return $GLOBALS["STORED_REPS"][$id]["ref_typ"][$typ];	# seek reference
	return false;
}
function Compile_Report($id, $cur_block, $exe=TRUE, $check=FALSE, $noFilters=FALSE) # $exe means we must retrieve data at last, not just prep the sql
{
	global $blocks, $obj, $z, $args;
#{print_r($GLOBALS);die($id);}
	if(!isset($GLOBALS["STORED_REPS"][$id]["sql"]))
	{
# Construct the report head
		$GLOBALS["STORED_REPS"][$id]["params"] = $GLOBALS["STORED_REPS"][$id] = Array();
		$GLOBALS["STORED_REPS"][$id]["rep_params"] = Array();
		$GLOBALS["STORED_REPS"][$id]["columns"] = Array();
		if($row = mysqli_fetch_array(Exec_sql("SELECT val FROM $z WHERE id=$id", "Get Report Header")))
			$GLOBALS["STORED_REPS"][$id]["header"] = $row["val"];
		else
			die_info("Report #$id was not found");
		if($check)
    		Check_Val_granted(REPORT, $row["val"], $id);
		$tables = $conds = $field_names = $joinedOn = $GLOBALS["CONDS"] = $GLOBALS["STORED_REPS"][$id][REP_JOIN] = array();
		$s = "_";   # Delimiter for numeric table names: arr$par$s$rec -> arr777_555
		$aggr_funcs = array("AVG", "COUNT", "MAX", "MIN", "SUM", "GROUP_CONCAT"); # Aggregative MySQL functions list
		$distinct = "";
	    $fieldsAll = $displayVal = $fieldsName = $displayName = Array();
	    $joined = Array();
# Prefix for the field name depends on $exe
		if($exe) # p is a Prefix for the field name
		{	$p = "a"; $pi = "i"; $pr = "r"; $pv = "v"; $pu = "u";	}
		else	# This is a subquery, mention it in the table prefix like a$id_$master instead of a$master
		{	$p = "a$id"."_"; $pi = "i$id"."_"; $pr = "r$id"."_"; $pv = "v$id"."_";  $pu = "u$id"."_";	}
# Get the Report Parameters & Columns
		$data_set = Exec_sql("SELECT rep.id up, rep.ord, col_def.up par, col_def.id typ, def_typ.id refr, COALESCE(def_typ.t, def.t, col_def.t) base
						, CASE WHEN cols.t=0 THEN rep.t ELSE COALESCE(col_typ.t, cols.t, rep.t) END col
						, CASE WHEN rep.t=".REP_COLS." THEN cols.id ELSE '' END id
						, CASE WHEN cols.t=0 THEN (CASE WHEN cols.ord=0 THEN CONCAT(rep.val, cols.val) ELSE cols.val END)
							ELSE COALESCE(col_typ.val, cols.val, rep.val) END val
						, CASE WHEN cols.t IS NULL AND col_def.id IS NULL THEN NULL WHEN col_def.val IS NULL THEN rep.ord WHEN req_def.val IS NULL THEN col_def.val
							WHEN def_typ.id=def_typ.t THEN CONCAT(req_def.val, ' -> ', def.val) ELSE req_def.val END name
						, CASE WHEN def_typ.id!=def_typ.t THEN col_def.val END mask, def_typ.val ref_name
						, rep.t jn, COALESCE(cols.val,'') jnon, rep_def_orig.val param
					FROM $z rep LEFT JOIN $z cols ON cols.up=rep.id 
						LEFT JOIN $z col_typ ON col_typ.id=cols.t AND rep.t=".REP_COLS." AND col_typ.up!=".REP_COLS
					."	LEFT JOIN $z col_def ON col_def.id=rep.val AND (rep.t=".REP_COLS." OR rep.t=".REP_JOIN.")"
					."	LEFT JOIN $z req_def ON col_def.up!=0 AND req_def.id=col_def.up
						LEFT JOIN $z rep_def ON rep_def.id=rep.t AND rep.t!=28
						LEFT JOIN $z rep_def_orig ON rep_def_orig.id=rep_def.t
						LEFT JOIN $z def ON col_def.up!=0 AND def.id=col_def.t
						LEFT JOIN $z def_typ ON def.id!=def.t AND def_typ.id=def.t
					WHERE rep.up=$id ORDER BY rep.ord"
				, "Get the Report Params & Columns");
		while($row = mysqli_fetch_array($data_set)) # Store all report params in an array
			if($row["jn"] == REP_JOIN){	# It's a JOIN
                trace("REP_JOIN [".($row["par"] > 0 ? $row["par"] : ($row["typ"] > 0 ? $row["typ"] : $row["up"]))."[".$row["col"]."]=".$row["jnon"]);
#				$GLOBALS["STORED_REPS"][$id][REP_JOIN][$row["par"] > 0 ? $row["par"] : ($row["typ"] > 0 ? $row["typ"] : $row["up"])][$row["col"]] = $row["jnon"];
				$GLOBALS["STORED_REPS"][$id][REP_JOIN][$row["up"]][$row["col"]] = $row["jnon"];
				$GLOBALS["STORED_REPS"][$id][REP_JOIN][$row["up"]]["type"] = $row["par"] > 0 ? $row["par"] : ($row["typ"] > 0 ? $row["typ"] : $row["up"]);
			}
			elseif($row["base"] || $row["id"])	# It's a Column
			{
				if(isset($row["mask"])){
				    $alias = FetchAlias($row["mask"], $row["ref_name"]);
				    if($alias == $row["ref_name"])
    					$GLOBALS["STORED_REPS"][$id]["head"][$row["ord"]] = $row["name"]." -> $alias";
    				else
    					$GLOBALS["STORED_REPS"][$id]["head"][$row["ord"]] = $row["name"]." -> $alias (".$row["ref_name"].")";
				}
				else
					$GLOBALS["STORED_REPS"][$id]["head"][$row["ord"]] = $row["name"];
				$GLOBALS["STORED_REPS"][$id]["types"][$row["ord"]] = isset($row["typ"])?$row["typ"]:"";
				$GLOBALS["STORED_REPS"][$id]["columns"][$row["ord"]] = $row["up"];
				if($row["par"])
					$GLOBALS["STORED_REPS"]["parents"][$row["typ"]] = $row["par"];
				if($row["refr"])
					$GLOBALS["STORED_REPS"][$id]["refs"][$row["ord"]] = $row["refr"];
			    #trace("_ check length of '".$row["val"]."' = ".strlen($row["val"]));
				$GLOBALS["STORED_REPS"][$id][$row["col"]][$row["ord"]] = trim($row["val"]);
				if(!isset($GLOBALS["REV_BT"][$row["typ"]]) && $row["typ"])
					$GLOBALS["REV_BT"][$row["typ"]] = $GLOBALS["basics"][$row["base"]];
			}
			elseif(isset($GLOBALS["STORED_REPS"][$id]["params"][$row["col"]])){	# It's a Param's tail
				$GLOBALS["STORED_REPS"][$id]["params"][$row["col"]] .= $row["val"];
				$GLOBALS["STORED_REPS"][$id]["rep_params"][$row["param"]] .= $row["val"];
			}
			else{	# It's a Param
				$GLOBALS["STORED_REPS"][$id]["params"][$row["col"]] = $row["val"];
				$GLOBALS["STORED_REPS"][$id]["rep_params"][$row["param"]] = $row["val"];
			}
        $GLOBALS["STORED_REPS"][$id]["columns_flip"] = array_flip($GLOBALS["STORED_REPS"][$id]["columns"]);
        # Add dynamically created columns
		if(isset($_REQUEST["SELECT"]) && $exe)
		{
	        $i = count($GLOBALS["STORED_REPS"][$id]["columns"]);
	        $select = explode(",", str_replace("\,", "%2c", $_REQUEST["SELECT"]));
			trace("Dynamic select: ".print_r($select, TRUE));
            foreach($select as $k => $v)
            {
                $f = explode(":", str_replace("\:","%3a",$v));
                if(!isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$f[0]]))
                {
    				$i++;
    				if(strlen($f[0]))
                        $f[0] = str_replace("%2c",",",str_replace("%3a",":",$f[0]));
                    else
                        $f[0] = "''";
    				$GLOBALS["STORED_REPS"][$id]["types"][$i] = "";
    				$GLOBALS["STORED_REPS"][$id]["columns"][$i] = $f[0];
					$GLOBALS["STORED_REPS"][$id]["head"][$i] = $f[0];
    				$GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$i] = $f[0];
    				$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f[0]] = $i;
				    trace("_ check filter for FR_$i");
    				if(isset($_REQUEST["FR_$k"]))
        				$GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$i] = $_REQUEST["FR_$k"];
                }
            }
			trace("Dynamic columns: ".print_r($GLOBALS["STORED_REPS"][$id], TRUE));
        }
        # Check if we have TOTALS specified
		if(isset($_REQUEST["TOTALS"]))
		{
	        $select = explode(",", $_REQUEST["TOTALS"]);
	        $tmp = Array();
			trace("custom totals: ".print_r($select, TRUE));
            foreach($select as $k => $v)
            {
    			trace("_ field: $k => $v");
                $f = explode(":", $v);
                if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$f[0]]) && in_array($f[1], $aggr_funcs))
                {
        			trace("__ add total: ".$f[0]."=>".$f[1]);
                    $tmp[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f[0]]] = $f[1];
                }
            }
            if(count($tmp) > 0)
                $GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL] = $tmp;
		}
		if(!is_array($GLOBALS["STORED_REPS"][$id]["types"]))
			my_die(t9n("[RU]Пустой отчет[EN]Empty report")." ".$GLOBALS["STORED_REPS"][$id]["header"]);
        # Clear the trace
        if($exe)
            mywrite("", "w");

        trace(print_r($GLOBALS["STORED_REPS"][$id], TRUE));
		foreach($GLOBALS["STORED_REPS"][$id]["types"] as $key => $typ)
		{
			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key]))
				$GLOBALS["STORED_REPS"][$id]["head"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key];
			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMAT][$key]))
			    if($GLOBALS["STORED_REPS"][$id][REP_COL_FORMAT][$key]!="")
        			$GLOBALS["STORED_REPS"][$id]["base_out"][$key] = $GLOBALS["STORED_REPS"][$id]["base_in"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FORMAT][$key];
			if(!isset($GLOBALS["STORED_REPS"][$id]["base_out"][$key]))
    			$GLOBALS["STORED_REPS"][$id]["base_out"][$key] = $GLOBALS["STORED_REPS"][$id]["base_in"][$key] = isset($GLOBALS["REV_BT"][$typ])?$GLOBALS["REV_BT"][$typ]:"SHORT";
		}
#print_r($GLOBALS["STORED_REPS"][$id]);die();
# If we have an UPDATE, reserve a column for its results report
		if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SET]))
		{
			if(isset($_REQUEST["confirmed"]) || isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["EXECUTE"]))
				$GLOBALS["STORED_REPS"][$id]["head"][] = t9n("[RU]Выполнено[EN]Done");
			else
				$GLOBALS["STORED_REPS"][$id]["head"][] = "<a href=\"#\" onclick=\"byId('report').action+='?confirmed';byId('report').submit();event.stopPropagation();\">".t9n("[RU]Выполнить[EN]Commit changes")."</a>";
		}
# Get the Entities - those having others as requisites
		if(!isset($GLOBALS["STORED_REPS"][$id]["sql"]))
		{
			$sql = "SELECT distinct CASE WHEN col_def.up=0 THEN col_def.id ELSE col_def.up END typ, reqs.id req, req_refs.t refr, arr_vals.up arr, reqs.val attr
					FROM $z rep LEFT JOIN $z col_def ON col_def.id=rep.val 
						LEFT JOIN $z reqs ON reqs.up=CASE WHEN col_def.up=0 THEN col_def.id ELSE col_def.up END
						LEFT JOIN $z req_refs ON req_refs.id=reqs.t AND length(req_refs.val)=0
						LEFT JOIN $z arr_vals ON arr_vals.up=reqs.t AND arr_vals.ord=1
					WHERE rep.up=$id AND rep.t=".REP_COLS." AND (req_refs.id IS NOT NULL OR arr_vals.id IS NOT NULL)
					ORDER BY rep.ord, reqs.ord";
			$data_set = Exec_sql($sql, "Get all Objects involved in Report along with their Refs");
# Report data retrieval - Fill in the arrays of Refs and Arrays
			while($row = mysqli_fetch_array($data_set))
# Save all the links from and to this Req and its Peers and Parent
				if($row["refr"])
				{
            		if(strpos($row["attr"], MULTI_MASK) !== FALSE){
            			$GLOBALS["MULTI"][$row["req"]] = $row["refr"];
						$distinct = "DISTINCT";	# Multies might return more than one row
            		}
					$GLOBALS["STORED_REPS"][$id]["references"][$row["typ"]][$row["refr"]] = $row["req"];
					$GLOBALS["STORED_REPS"][$id]["ref_typ"][$row["req"]] = $row["refr"];
				}
# Save all the Array dependencies of this Req and its Parent
				else
					$GLOBALS["STORED_REPS"][$id]["arrays"][$row["typ"]][$row["arr"]] = $row["req"];
# Replace the report params with the gotten ones from $_REQUEST
            if(!$noFilters)
    			foreach($GLOBALS["STORED_REPS"][$id]["types"] as $key => $typ){ # Col => Type
        			trace(" Replace the report params with the gotten ones from REQUEST: $key => $typ");
    			    # Fill in the array of conditions for Construct_WHERE()
    			    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key])){
        			    $str = str_replace(" ", "_", $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key]);
    			        if(isset($_REQUEST["FR_$str"]))
    			            if(strlen($_REQUEST["FR_$str"]))
                				$GLOBALS["CONDS"][$key]["FR"] = $_REQUEST["FR_$str"];
    			        if(isset($_REQUEST["TO_$str"]))
    			            if(strlen($_REQUEST["TO_$str"]))
                				$GLOBALS["CONDS"][$key]["TO"] = $_REQUEST["TO_$str"];
    			    }
    				if(!isset($GLOBALS["CONDS"][$key]["FR"]) && isset($GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$key]))
                            $GLOBALS["CONDS"][$key]["FR"] = $GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$key];
    				if(!isset($GLOBALS["CONDS"][$key]["TO"]) && isset($GLOBALS["STORED_REPS"][$id][REP_COL_TO][$key]))
                            $GLOBALS["CONDS"][$key]["TO"] = $GLOBALS["STORED_REPS"][$id][REP_COL_TO][$key];
    			}
            $i = 0;
			foreach($GLOBALS["STORED_REPS"][$id]["types"] as $key => $typ){
				if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])){ # Not hidden field
				    $i++; // Find first 2 visible fields to apply the _ref_reqs filter
        		    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key]))
                        # Replace the report params for the 1 and 2 cols in case we got a filter for DD list (see _ref_reqs)
            	        if(isset($GLOBALS["REQREF"]["$i"]))
            	            if(strlen($GLOBALS["REQREF"]["$i"]))
                				$GLOBALS["CONDS"][$key]["FR"] = $GLOBALS["REQREF"]["$i"];
				}
    	        if($i === 2)
    	            break;
			}
# In case some function received in the request - implement those
			if(isset($_REQUEST["SELECT"])){
			    $new_funcs = Array();
		        $select = explode(",", str_replace("\,", "%2c", $_REQUEST["SELECT"]));
    			trace("Functions: ".print_r($select, TRUE));
                foreach($select as $k => $v){
                    $f = explode(":", str_replace("\:","%3a",$v));
                    if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$f[0]]))
                        $new_funcs[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f[0]]] = strtoupper($f[1]);
                }
                if(count($new_funcs) > 0)
					$GLOBALS["STORED_REPS"][$id][REP_COL_FUNC] = $new_funcs;
    			trace("New Functions: ".print_r($new_funcs, TRUE));
            }

			$not_all_joined = TRUE;
			$circle = 0;
			while($not_all_joined){
				$not_all_joined = FALSE;
				$no_progress = TRUE;
			    if($circle++ > 1000)
				    die_info($GLOBALS["STORED_REPS"][$id]["header"].": ".t9n("[RU]Не могу связать колонки отчета.[EN]Failed to link the columns of the report."));
				foreach($GLOBALS["STORED_REPS"][$id]["types"] as $key => $typ){ # Column # => Type
					if(strlen($typ)){ # A real field, not a synthetic (calculatable) one
						$par = $par_alias = isset($GLOBALS["STORED_REPS"]["parents"][$typ]) ? $GLOBALS["STORED_REPS"]["parents"][$typ] : $typ;
						$alias = $typ;
						if(!isset($master)){  # Master is the Parent of the first column of the report
							$master = $par_alias;
							$tables[$master] = "$z $p$master";
							if(isset($_REQUEST["i$master"])) # We got an explicit filter for $master table
								$conds[$master] = "$p$master.id=%$master"."_OBJ_ID%";
							else
								$conds[$master] = "$p$master.up!=0 AND length($p$master.val)!=0 AND $p$master.t=$par";
						}
						unset($repJoin);
                	    if(isset($GLOBALS["STORED_REPS"][$id][REP_JOIN]))
                	        foreach($GLOBALS["STORED_REPS"][$id][REP_JOIN] as $k => $rf)
                	            if($rf["type"] === $par_alias)
                	                if(!isset($rf[REP_ALIAS])
                	                       || ($GLOBALS["STORED_REPS"][$id][REP_COL_ALIAS][$key]) === $rf[REP_ALIAS])
                    	                $repJoin = $k;
						if(isset($repJoin)){
                            trace("REP_JOIN found ".$GLOBALS["STORED_REPS"][$id][REP_JOIN][$repJoin]);
                            if(isset($GLOBALS["STORED_REPS"][$id][REP_JOIN][$repJoin][REP_JOIN_ON])){
                                trace("REP_JOIN_ON found ".$GLOBALS["STORED_REPS"][$id][REP_JOIN][$repJoin][REP_JOIN_ON]);
                                $par_orig = $par_alias;
                                if(isset($GLOBALS["STORED_REPS"][$id][REP_JOIN][$repJoin][REP_ALIAS])){
                                    $par_alias = $GLOBALS["STORED_REPS"][$id][REP_JOIN][$repJoin][REP_ALIAS];
                                    trace("$alias found");
                                }
                                $alias = $par_alias . ($typ !== $par ? $typ : "");
                            }
					    }
						# Note: Aliased Master would be skipped, its JOIN condition doesn't make sense, it will get to WHERE
						if(!isset($tables[$alias])){ # The table is not joined yet
    			    		trace("$alias not joined yet");
							if(!isset($tables[$par_alias])){ # The parent is not joined yet
        			    		trace("_ parent $par_alias ($par_orig) of $alias not joined yet");
								$on = " AND $p$par_alias.t=$par";
								# First check the FROM set of the report
                        	    if(isset($repJoin)){
                        	        trace("__ REP_JOIN for $par_alias");
                        	        $rf = $GLOBALS["STORED_REPS"][$id][REP_JOIN][$repJoin];
                        		    $join = "";
                        			if(isset($rf[REP_JOIN_ON])){
                        			    preg_match_all("/:(\d+):/", $rf[REP_JOIN_ON], $matches); # :([\dA-Za-zа-яА-Я _]+):
                        			    foreach($matches[1] as $j)
                        			        if(($j != $par_alias) && !isset($tables[$j])){
                                    	        trace("___ $j required, not joined");
                        			            continue(2);
                        			        }
#                            		    $join = "AND " . preg_replace("/:(\d+):/", "$1", $rf[REP_JOIN_ON]);
                            		    $join = $rf[REP_JOIN_ON];
                        			}
                        			$tmp = explode("=", $join); 
                        			$right = explode(".", $tmp[1]);
                        			if(!isset($tables[substr($right[0], 1)])){
        							    trace("___ REP_JOIN right table for $join not present yet");
        								$not_all_joined = TRUE;
        								continue;
        							}
                        			$tables[$par_alias] = " LEFT JOIN $z $p$par_alias ON $p$par_alias.t=$par_orig AND $join";
                        			
                    			    preg_match_all("/($p$par_alias\.\w+)/", $join, $matches); # Get all the required fields
                    			    if(count($matches[1]))
                        			    foreach($matches[1] as $j){
        									$joined["$p$par_alias"][$j] = $j;
        									trace("joined[$p$par_alias][$j] = $j");
                        			    }
        						    else
    									$joined["$p$par_alias"][$par_alias] = "$p$par_alias.*";
									$joinedFrom["$p$par_alias"] = "FROM $z $p$par_alias";
									$joinedClause["$p$par_alias"] = " WHERE $p$par_alias.t=$par_orig";
									$joinedOn["$p$par_alias"] = ") $p$par_alias ON $join";
                        	        trace("__ ".$tables[$par_alias]);
                        	    }
                        	    elseif(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_ALIAS][$key]))
								foreach($tables as $t => $j){ # Look through joined tables
            			    		trace("__ Look through joined tables");
									if(substr($t, strpos($t, "_")) === (isset($suffix) ? $suffix : ""))
										$orig = substr($t, 0, strpos($t, "_"));
									else
										$orig = $t;
									if((int)$t === (int)$master){
    									$ptid = "$p$t.id";
    									$ptup = "$p$t.up";
									}
									else{
    									$ptid = "$p$t"."_id";
    									$ptup = "$p$t"."_up";
									}
									# Get first suitable link if any
									if(isset($GLOBALS["STORED_REPS"][$id]["references"][$orig][$par]) # Reference to us
									        &&  ($t."_alias" !== $par_alias)) # and it's not the same Typ reference
									{
                			    		trace("___ first suitable link [$orig]->[$par]"); // multiple refs to fix
										if(!isset($joined["$p$t"]) || (strpos(implode(" ", $joined["$p$t"]), $ptid) === false))
										    $joined["$p$t"][$ptid] = "$p$t.id $ptid";
										if(HintNeeded($key, $id)){
											$tables[$par_alias] = " LEFT JOIN ($z $pr$par_alias CROSS JOIN $z $p$par_alias USE INDEX (PRIMARY)) ON $pr$par_alias.up=$p$t.id AND $p$par_alias.id=$pr$par_alias.t $on";
    										$joined["$p$par_alias"][$par_alias] = "$pr$par_alias.up";
    										$joinedFrom["$p$par_alias"] = "FROM $z $pr$par_alias,$z $p$par_alias USE INDEX (PRIMARY)";
    										$joinedClause["$p$par_alias"] = " WHERE $p$par_alias.id=$pr$par_alias.t $on ";
    										$joinedOn["$p$par_alias"] = ") $p$par_alias ON $p$par_alias.up=$ptid";
										}
										else{
											$tables[$par_alias] = " LEFT JOIN ($z $pr$par_alias CROSS JOIN $z $p$par_alias) ON $pr$par_alias.val='".$GLOBALS["STORED_REPS"][$id]["references"][$orig][$par]."'"
																	." AND $pr$par_alias.up=$p$t.id AND $p$par_alias.id=$pr$par_alias.t $on";
    										$joined["$p$par_alias"][$par_alias] = "$pr$par_alias.up,$pr$par_alias.val";
    										$joinedFrom["$p$par_alias"] = "FROM $z $pr$par_alias,$z $p$par_alias";
    										$joinedClause["$p$par_alias"] = " WHERE $p$par_alias.id=$pr$par_alias.t $on ";
    										$joinedOn["$p$par_alias"] = ") $p$par_alias ON $p$par_alias.val='".$GLOBALS["STORED_REPS"][$id]["references"][$orig][$par]."'"
																	." AND $p$par_alias.up=$ptid";
										}
									}
									elseif(isset($GLOBALS["STORED_REPS"][$id]["arrays"][$orig][$par])) # We are an Array
									{
                			    		trace("___ We are an Array [$par]->[$orig]");
										$tables[$par_alias] = " LEFT JOIN $z $p$par_alias ON $p$par_alias.up=$p$t.id $on";
										$joined["$p$par_alias"][$par_alias] = "$p$par_alias.up";
										$joinedFrom["$p$par_alias"] = "FROM $z $p$par_alias";
										$joinedClause["$p$par_alias"] = " WHERE $p$par_alias.t=$par";
										if(!isset($joined["$p$t"]) || strpos(implode(",", $joined["$p$t"]), $ptid) === false)
										    $joined["$p$t"][$ptid] = "$p$t.id $ptid";
										$joinedOn["$p$par_alias"] = " ) $p$par_alias ON $p$par_alias.up=$ptid";
										$GLOBALS["STORED_REPS"][$id]["PARENT"][$par] = $orig;
									}
									elseif(isset($GLOBALS["STORED_REPS"][$id]["references"][$par][$orig])) # We have a Reference
									{
										//#[AS] 21.06.2023
										if(!isset($joined["$p$t"]) || strpos(implode(",", $joined["$p$t"]), $ptid) === false)
										    $joined["$p$t"][$ptid] = "$p$t.id $ptid";
                			    		trace("___ We have a Reference [$par]->[$orig]");  // multiple refs to fix
										if(HintNeeded($key, $id))
										{
											$tables[$par_alias] = " LEFT JOIN ($z $pr$par_alias CROSS JOIN $z $p$par_alias USE INDEX (PRIMARY)) ON $pr$par_alias.up=$p$par_alias.id AND $p$t.id=$pr$par_alias.t AND $pr$par_alias.val='"
											                        .$GLOBALS["STORED_REPS"][$id]["references"][$par][$orig]."' $on";
    										$joined["$p$par_alias"][$par_alias] = "$pr$par_alias.t";
    										$joinedFrom["$p$par_alias"] = "FROM $z $pr$par_alias,$z $p$par_alias /*USE INDEX (PRIMARY)*/";
    										$joinedClause["$p$par_alias"] = " WHERE $pr$par_alias.up=$p$par_alias.id AND $pr$par_alias.val='".$GLOBALS["STORED_REPS"][$id]["references"][$par][$orig]."' $on";
    										$joinedOn["$p$par_alias"] = ") $p$par_alias ON $ptid=$p$par_alias.t ";
										}
										else
										{
    										$joined["$p$par_alias"][$par_alias] = "$pr$par_alias.t,$pr$par_alias.val";
											$tables[$par_alias] = " LEFT JOIN ($z $pr$par_alias CROSS JOIN $z $p$par_alias) ON $pr$par_alias.val='".$GLOBALS["STORED_REPS"][$id]["references"][$par][$orig]."'"
																	." AND $pr$par_alias.up=$p$par_alias.id AND $p$t.id=$pr$par_alias.t $on";
    										$joinedFrom["$p$par_alias"] = "FROM $z $pr$par_alias,$z $p$par_alias";
    										$joinedClause["$p$par_alias"] = " WHERE $pr$par_alias.up=$p$par_alias.id $on ";
    										$joinedOn["$p$par_alias"] = " ) $p$par_alias ON $p$par_alias.val='".$GLOBALS["STORED_REPS"][$id]["references"][$par][$orig]."'"
																	." AND $ptid=$p$par_alias.t";
										}
									}
									elseif(isset($GLOBALS["STORED_REPS"][$id]["arrays"][$par][$orig])) # We got an Array
									{
                			    		trace("___ We got an Array [$par]->[$orig]");
										$tables[$par_alias] = " LEFT JOIN $z $p$par_alias ON $p$t.up=$p$par_alias.id $on";
										$joinedFrom["$p$par_alias"] = "FROM $z $p$par_alias";
										$joinedClause["$p$par_alias"] = " WHERE $p$par_alias.t=$par";
										if(!isset($joined["$p$t"]) || strpos(implode(",", $joined["$p$t"]), $ptup) === false)
										    $joined["$p$t"][$ptup] = "$p$t.up $ptup";
									    $joined["$p$par_alias"][$par_alias] = "$p$par_alias.id";
										$joinedOn["$p$par_alias"] = " ) $p$par_alias ON $ptup=$p$par_alias.id";
										$GLOBALS["STORED_REPS"][$id]["PARENT"][$orig] = $par;
									}
									else
										continue;
									trace("____ ".$tables[$par_alias]);
									break;
								}
							}
							if(!isset($tables[$par_alias])) # Failed to join the parent, better luck next round
							{
							    trace("__ Failed to join the parent $par_alias, better luck next round");
								$not_all_joined = TRUE;
								continue;
							}
							if($typ != $par)	# We are a requisite
							{
								if(!isset($tables[$alias]))
								    $tables[$alias] = "";
								if($l = isRef($id, $par, $typ)){
									if(HintNeeded($key, $id)) // multiple refs to fix
									{
										$tables[$alias] .= "LEFT JOIN ($z $pr$alias CROSS JOIN $z $p$alias USE INDEX (PRIMARY)) ON $pr$alias.up=$p$par_alias.id AND $p$alias.id=$pr$alias.t AND $p$alias.t=$l AND $pr$alias.val='$typ' ";
										$joinedJoin["$p$par_alias"][] = "LEFT JOIN ($z $pr$alias CROSS JOIN $z $p$alias USE INDEX (PRIMARY)) ON $pr$alias.up=$p$par_alias.id AND $p$alias.id=$pr$alias.t AND $p$alias.t=$l AND $pr$alias.val='$typ' ";
									}
									else{
										$tables[$alias] .= "LEFT JOIN ($z $pr$alias CROSS JOIN $z $p$alias) ON $pr$alias.up=$p$par_alias.id AND $pr$alias.val='$typ' AND $p$alias.id=$pr$alias.t AND $p$alias.t=$l";
										$joinedJoin["$p$par_alias"][] = "LEFT JOIN ($z $pr$alias CROSS JOIN $z $p$alias) ON $pr$alias.up=$p$par_alias.id AND $pr$alias.val='$typ' AND $p$alias.id=$pr$alias.t AND $p$alias.t=$l";
									}
								}
								else{
									$tables[$alias] .= "LEFT JOIN $z $p$alias ON $p$alias.up=$p$par_alias.id AND $p$alias.t=$typ";
									$joinedJoin["$p$par_alias"][] = "LEFT JOIN $z $p$alias ON $p$alias.up=$p$par_alias.id AND $p$alias.t=$typ";
								}
							}
						}
						unset($field);
						if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]))
    						if(substr($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key], 0, 4) == "abn_")
    						{
        			    		trace("ABN_ key $alias $key ".$GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]);
    							switch($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key])
    							{
    								case "abn_ID":
    									$field = "$p$alias.id";  # Requisite ID
    									break;
    								case "abn_UP":
    									$field = "$p$alias.up";  # Parent ID
    									break;
    								case "abn_TYP":
    									$field = "$p$alias.t";   # Requisite Type
    									break;
    								case "abn_ORD":
    									$field = "$p$alias.ord";  # Requisite Order
    									break;
    								case "abn_REQ":
    									$field = "$alias";	# Requisite definition ID
    									break;
    								case "abn_BT":	# Base typ
    									$field = $GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["types"][$key]];
    									break;
    							}
    							if(isset($field))
    							{
    								$GLOBALS["STORED_REPS"][$id]["base_in"][$key] = "NUMBER";
    								unset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]); # No more actions for this
    								$GLOBALS["STORED_REPS"][$id]["abn_"][$key] = "";
    							}
    						}
						if(!isset($field))
							$field = "$p$alias.val";
			    		trace("abn_ $field $key set to $field ");
						if(isset($fields[$key]))
							continue;
						$no_progress = FALSE;
						if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key]))
    						$name = "'".str_replace("'", "\\'", $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key])."'";
    					else
    						$name = "$pv$key$s$par";
						# Replace [THIS] with the field value in case we got a Formula and [THIS] mentioned in the formula
    					if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key]))
    					    if(mb_strpos($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key],"[THIS]")!==FALSE)
    	    				    $field = str_replace("[THIS]", $field, $GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key]);
						$fieldsOrig[$key] = $master == $par_alias ? $field : str_replace(".", "_", $field);
						$fields[$key] = $field;
						$names[$key] = $name;
						if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # Not hidden field
						{
    						$displayName[$key] = $name;
							if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]))
							{
							    trace(" REP_COL_FUNC $key to $field $name");
    							if(in_array($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key], $aggr_funcs)) # Needs grouping
    							{
    							    trace("# Needs grouping ".$GLOBALS["REV_BT"][$typ]);
    							    if($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] === "GROUP_CONCAT")
    							    {
        								$field_names[$key] = "GROUP_CONCAT(DISTINCT $field) $name ";
        								$displayVal[$key] = "GROUP_CONCAT(DISTINCT $fieldsOrig[$key])";
        								$GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key] = "GROUP_CONCAT(DISTINCT $field)";
    							    }
    							    elseif(($GLOBALS["REV_BT"][$typ] == "NUMBER") || ($GLOBALS["REV_BT"][$typ] == "DATETIME"))
    							    {
        								$field_names[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."(CAST($field AS DOUBLE)) $name ";
        								$displayVal[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] . "(CAST(" . $fieldsOrig[$key] . " AS DOUBLE))";
        								$GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."(CAST($field AS DOUBLE))";
    							    }
    							    elseif($GLOBALS["REV_BT"][$typ] == "SIGNED")
    							    {
        								$field_names[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."(CAST($field AS DOUBLE)) $name";
        								$displayVal[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] . "(CAST(" . $fieldsOrig[$key] . " AS DOUBLE))";
        								$GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."(CAST($field AS DOUBLE))";
    							    }
    							    else
    							    {
        								$field_names[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field) $name";
        								$displayVal[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] . "(" . $fieldsOrig[$key] . ")";
        								$GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)";
    							    }
    								
    								if(isset($joined["$p$par_alias"]))
        								if(array_search("$field " . $fieldsOrig[$key], $joined["$p$par_alias"]) === false)
            								$joined["$p$par_alias"][$key] = "$field " . $fieldsOrig[$key];
    								$GLOBALS["STORED_REPS"][$id]["aggrs"][$key] = "";
    							}
    							elseif(substr($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key], 0, 4) == "abn_")
    							{
    								$field_names[$key] = "$field $name"; # Post-processing abn_ function like NUM2STR
    								$displayVal[$key] = $field;
    								$GLOBALS["STORED_REPS"][$id]["abn_"][$key] = "";
    							}
    							elseif(strlen($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key])) # No grouping needed
    							{
    								$field_names[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field) $name";
    								$displayVal[$key] = $master == $par_alias ? $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)" : $fieldsOrig[$key];
    								$joined["$p$par_alias"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)" . " " . $fieldsOrig[$key];
									if($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] !== "RECURSIVE")
        								unset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]);
    							}
#   							elseif($GLOBALS["REV_BT"][$bt[$key]] == "PATH")
#	    							$field_names[$key] = "CONCAT($p$alias.id, SUBSTRING($field, -4)) $name";
							}
							if(!isset($field_names[$key])){
							    trace(" set field_names[$key] to $field $name");
								$field_names[$key] = "$field $name";
								
								if($master == $par_alias)
								{
    								$joined["$p$par_alias"][$key] = "";
    								$displayVal[$key] = $field;
								}
    							else
    							{
    								$displayVal[$key] = $fieldsOrig[$key];
    								if(!isset($joined["$p$par_alias"]) || (strpos(implode(" ",$joined["$p$par_alias"]),$fieldsOrig[$key]) === false))
        								$joined["$p$par_alias"][$key] = $field . " " . $fieldsOrig[$key];
    							}
							}
							if((($par == $typ) && isset($GLOBALS["STORED_REPS"][$id]["params"][REP_HREFS]) # It's a parent & report is Interactive
										&& !isset($GLOBALS["STORED_REPS"][$id]["abn_"][$key]) # it's not a function value
										&& !isset($GLOBALS["STORED_REPS"][$id]["aggrs"][$key])) # & no aggregates applied to this field
								/*|| ($GLOBALS["STORED_REPS"][$id]["base_in"][$key] == "FILE")	# Or we have a file here
								|| ($GLOBALS["STORED_REPS"][$id]["base_in"][$key] == "PATH")*/)
							{
								$field_names["$pi$key"] = "$p$alias.id $pi$key";   # Fetch the ID to build a HREF
								$joined["$p$par_alias"]["$pi$key"] = "$p$alias.id $pi$key";
								$displayVal["$pi$key"] = $master == $par_alias ? "$p$alias.id " : "";
								$displayName["$pi$key"] = "$pi$key";
								$fields["$pi$key"] = "$p$alias.id";
								$names["$pi$key"] = "$pi$key";
							}
							elseif(($GLOBALS["STORED_REPS"][$id]["base_in"][$key] == "FILE")	# Or we have a file here
    								|| ($GLOBALS["STORED_REPS"][$id]["base_in"][$key] == "PATH"))
    						{
    						    if($master == $par_alias)
    						    {
    								$field_names[$key] = "CONCAT($p$alias.id,':',$field) $name";
    								$displayVal["$key"] = "CONCAT($p$alias.id,':',$field)";
    						    }
    						    else
    						    {
    								$field_names[$key] = "CONCAT($p$alias"."_id,':',$p$alias"."_val) $name";
    								$displayVal["$key"] = "CONCAT($p$alias"."_id,':',$p$alias"."_val)";
    								if((strpos(implode(" ", $joined["$p$par_alias"]), "$p$alias.id $p$alias"."_id") === false))
    								    $joined["$p$par_alias"]["$pi$key"] = "$p$alias.id $p$alias"."_id";
    						    }
    						}
							if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key])){ # We have a value to set
								# Fetch the value for UPDATE stmt
							    trace("REP_COL_SET for $key - ".$GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key]);
								# Fetch the ID to update the value
								$displayName["$pi$key"] = "$pi$key";
								if(isRef($id, $par, $typ))
								{
									$field_names["$pi$key"] = "$pr$alias.id $pi$key";   # Fetch the ID to update the value
    								if($master == $par_alias)
    								{
        								$joined["$p$par_alias"]["$pi$key"] = "";
        								$displayVal["$pi$key"] = "$pr$alias.id";
    								}
        							else
        							{
        								$joined["$p$par_alias"]["$pi$key"] = "$pr$alias.id $pi$key";
        								$displayVal["$pi$key"] = "";
        							}
								}
								else
								{
									$field_names["$pi$key"] = "$p$alias.id $pi$key";
    								if($master == $par_alias)
    								{
        								$joined["$p$par_alias"]["$pi$key"] = "";
        								$displayVal["$pi$key"] = "$p$alias.id";
    								}
        							else
        							{
        								$joined["$p$par_alias"]["$pi$key"] = "$p$alias.id $pi$key";
        								$displayVal["$pi$key"] = "";
        							}
								}
								$fields["$pi$key"] = "$p$alias.id";
								$names["$pi$key"] = "$pi$key";

								$update_val = BuiltIn($GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key]);
								if($GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key] != $update_val)
									$update_val = "'$update_val'";	# BuiltIn gave something, freeze the result
        					    elseif(mb_strpos($update_val,"[THIS]") !== FALSE)
        	    				    $update_val = str_replace("[THIS]", $field, $update_val);
								$field_names["$pu$key"] = "$update_val $pu$key";
								
								$displayVal["$pu$key"] = $update_val;
								$displayName["$pu$key"] = "$pu$key";

								$fields["$pu$key"] = "$pu$alias.id";
								$names["$pu$key"] = "$pu$key";
								if(!isset($field_names["$pi$par"]) && ($par != $typ))
								{
									$field_names["$pi$par"] = "$p$par.id $pi$par";
    								$displayName["$pi$par"] = "$pi$par";
    								$displayVal["$pi$par"] = "$p$par".($par == $master ? "." : "_")."id";
    								
    								if($master == $par_alias)
        								$joined["$p$par_alias"]["$pi$par"] = "";
        							elseif(strpos(implode(" ", $joined["$p$par_alias"]), "$p$par".($par == $master ? "." : "_")."id") === false)
        								$joined["$p$par_alias"]["$pi$par"] = "$p$par.id $p$par".($par == $master ? "." : "_")."id";
        							
									$fields["$pi$par"] = "$p$par.id";
									$names["$pi$par"] = "$pi$par";
								}
							}
						}
						else
						{
						    $fieldsAll[$key] = $fieldsOrig[$key];
						    $fieldsName[$key] = $name;
						    if(($master !== $par_alias) && (isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key])
                        						            || isset($GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$key]) || isset($GLOBALS["STORED_REPS"][$id][REP_COL_TO][$key])
                        						            || isset($GLOBALS["STORED_REPS"][$id][REP_COL_HAV_FR][$key]) || isset($GLOBALS["STORED_REPS"][$id][REP_COL_HAV_TO][$key])))
                        		if(strpos(implode(" ", $joined["$p$par_alias"]), $fieldsOrig[$key]) === false)
						            $joined["$p$par_alias"][$key] = "$field " . $fieldsOrig[$key];
						}
					}
					else
					{
						$no_progress = FALSE;
						# Save real field names to replace those in the synthetic operations
						if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key]))
						{
							$field = $GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key];
							if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]))
								if($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] == 'abn_URL')
									$field = "'abn_URL($key)'";
						}
						elseif(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]))
							$field = "'".$GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]." $key - $typ'";
						else
							$field = t9n("[RU]'Пустая или неверная формула в вычисляемой колонке (№$key)'"
							        ."[EN]'Empty or incorrect formula in column #$key'");
						if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key]))
    						$name = "'".str_replace("'", "\\'", $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][$key])."'";
    					else
    						$name = "$pv$key";
						$fields[$key] = $field;
						$names[$key] = $name;

						if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key]))
						{
							$field_names[$key] = "$field $name";
    						$displayVal[$key] = $field;
    						$displayName[$key] = $name;
						    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]))
						    {
    							if(in_array($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key], $aggr_funcs)) # Needs grouping
    							{
    								$field_names[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field) $name";
									$fields[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)"; //[AS]12.04.2019
            						$displayVal[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)";
    								$GLOBALS["STORED_REPS"][$id]["aggrs"][$key] = "";
    							}
    							elseif(strlen($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key])) # No grouping needed
    							{
    									if(substr($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key], 0, 4) == "abn_")
    										$field_names[$key] = "$field $name";
    									else
    									{
    										$field_names[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field) $name";
    										$displayVal[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)";
        									$fields[$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]."($field)"; //[AS]12.04.2019
    										unset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]);
    									}
    							}
						    }
						}
						else
						{
						    $fieldsAll[$key] = $field;
						    $fieldsName[$key] = $name;
						}
					}
					if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key]))
					{
					    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key]) && ($master !== $par_alias))
	    				    // In case we have an order for a hidden field - fetch the field during the JOIN
	    				    if(strpos(implode(" ", $joined["$p$par_alias"]), $fieldsOrig[$key]) === false)
        						$joined["$p$par_alias"][$key] = $field . " " . $fieldsOrig[$key];
    					if($GLOBALS["STORED_REPS"][$id]["base_out"][$key] == "NUMBER" || $GLOBALS["STORED_REPS"][$id]["base_out"][$key] == "SIGNED")
    					    $tmp = "CAST(".(isset($GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key])?$GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key]
    					                                                                :$fields[$key])." AS DOUBLE)";
                        else
    						#$tmp = $displayVal[$key];
    						$tmp = isset($displayVal[$key]) ? $displayVal[$key] : $fields[$key];
						if($GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key] < 0)
    					    $sortByArr[-$GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key]] = ($master == $par_alias ? $tmp : str_replace(".", "_", $tmp)) . " DESC";
						else
    					    $sortByArr[$GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key]] = $master == $par_alias ? $tmp : str_replace(".", "_", $tmp);
					}
# Create WHERE condition according to the data types
					if(isset($filters[$key]))# || isset($field_names[$key])) # The filter is already set
						continue;
					if(isset($GLOBALS["CONDS"][$key]))	# If we got some filter conditions
					{
						$GLOBALS["REV_BT"][$alias] = $GLOBALS["STORED_REPS"][$id]["base_in"][$key]; # Get Base Type for our column
						$GLOBALS["where"] = "";
						Construct_WHERE($alias, $GLOBALS["CONDS"][$key], 1, FALSE);
						$filters[$key] = str_replace("a$alias.val", $field, $GLOBALS["where"]);
						if(($master == $par_alias) || !isset($fieldsOrig[$key]))
    						$masterFilters[$key] =  $filters[$key];
    					else
    					{
	    				    if(strpos(implode(" ", $joined["$p$par_alias"]), $fieldsOrig[$key]) === false)
        						$joined["$p$par_alias"]["f$key"] = $field . " ".$fieldsOrig[$key];
    						$masterFilters[$key] = str_replace($field, $fieldsOrig[$key], $filters[$key]);
    					}
                        if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key]) && ($par != $master)){
                            # We have a value to set, so return an empty line even in case the condition fails
							$tables[$typ] .= $filters[$key];	# Move the condition from WHERE to JOIN
							$joinedOn["$p$par_alias"] .= $masterFilters[$key];
							unset($filters[$key]);
							unset($masterFilters[$key]);
							if(isset($GLOBALS["STORED_REPS"][$id]["PARENT"][$typ])){
								$par_id = $GLOBALS["STORED_REPS"][$id]["PARENT"][$typ];
								if(!strpos($field_names[$key], "a$par_id.id i$par_id")) # Fetch parent ID to create a req
								{
									$field_names[$key] .= ", a$par_id.id i$par_id";
																   
    								$displayVal["i$par_id"] = $par_id == $master ? "a$par_id.id, a$par_id.id i$par_id" : "i$par_id";
                        		    $joined["a$par_id"]["a$par_id.id"] = "a$par_id.id i$par_id ";
								}
							}
						}
					}
					elseif(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key]) && ($par != $master))
						# We have a value to set, so fetch the parent's ID just in case there's no Value
						if(isset($GLOBALS["STORED_REPS"][$id]["PARENT"][$typ]))
						{
																	  
							$par_id = $GLOBALS["STORED_REPS"][$id]["PARENT"][$typ];
							if(!strpos($field_names[$key], "a$par_id.id i$par_id")) # Fetch parent ID to create a req
							{
								$field_names[$key] .= ", a$par_id.id i$par_id";
								$displayName["i$par_id"] = "i$par_id";
								$displayVal["i$par_id"] = "a$par_id.id";
//#[AS] 20220925         		    $joined["a$par_id"]["a$par_id.id"] = "a$par_id.id i$par_id";
                    		    $joined["a$par_id"]["a$par_id.id"] = "a$par_id.id";
							}
						}
				}
				if($not_all_joined && $no_progress)
				{
#{print_r($tables);print_r($conds);print_r($field_names);print_r($filters);print_r($GLOBALS["STORED_REPS"]);print_r($GLOBALS);die("Не могу связать колонки отчета");}
#break;
				    die_info($GLOBALS["STORED_REPS"][$id]["header"].": ".t9n("[RU]Невозможно связать колонки отчета.[EN]It is impossible to link the columns of the report."));
				}
				# We might get the Object explicitly set for Calculatables
				if(isset($_REQUEST["i$typ"]) && ($typ != $master))
					$conds[$typ] = " AND $p$typ.id=%$typ"."_OBJ_ID%";
			}
		    $fieldsAll = $fieldsAll + $displayVal;
		    $fieldsName = $fieldsName + $displayName;

# Check if we have a field set specified in request
			trace("Globals: ".print_r($GLOBALS["STORED_REPS"][$id], TRUE));
			trace("field_names: ".print_r($field_names, TRUE));
			trace("names: ".print_r($names, TRUE));
			trace("fields: ".print_r($fields, TRUE));
			if(isset($_REQUEST["SELECT"]))
			{
			    $new_field_names = $new_head = $new_fields = Array();
		        $select = explode(",",str_replace("\,", "%2c", $_REQUEST["SELECT"]));
    			trace("select: ".print_r($select, TRUE));
		    	trace("fields: ".print_r($fields, TRUE));
                foreach($select as $k => $v)
                {
                    $v = array_shift(explode(":", str_replace("\:","%3a",$v)));
                    $v = str_replace("%2c",",",str_replace("%3a",":",$v));
                    if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]))
                    {
        		    	trace("_ found in columns_flip: $k => $v");
                        $new_field_names[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]] = $field_names[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]];
                        $new_head[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]] = $GLOBALS["STORED_REPS"][$id]["head"][$GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]];
                    }
                }
                if(count($new_field_names)>0)
                {
    			    $field_names = $new_field_names;
    			    $GLOBALS["STORED_REPS"][$id]["head"] = $new_head;
                }
    			trace("columns: ".print_r($GLOBALS["STORED_REPS"][$id]["columns_flip"], TRUE));
		    	trace("new field_names: ".print_r($field_names, TRUE));
			}
# Format the output
			foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
				if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMAT][$key]))	# Set the column result Type
					$GLOBALS["STORED_REPS"][$id]["base_out"][$key] = $GLOBALS["STORED_REPS"][$id][REP_COL_FORMAT][$key];
				else
					$GLOBALS["STORED_REPS"][$id]["base_out"][$key] = isset($GLOBALS["STORED_REPS"][$id]["base_in"][$key]) ? $GLOBALS["STORED_REPS"][$id]["base_in"][$key] : "SHORT";

# Construct the GROUP BY clause, if applicable
			if(isset($GLOBALS["STORED_REPS"][$id]["aggrs"])) # We have at least one aggregation function
				foreach($fields as $key => $value)
				    if(isset($field_names[$key])) # Only those values selected
    					if((!isset($GLOBALS["STORED_REPS"][$id]["aggrs"][$key])) # The field isn't aggregated
							&& (!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key]))  # and not hidden
							&& !(($GLOBALS["STORED_REPS"][$id]["types"][$key]=="") # and not a calculatable with aggregation
							    && (preg_match("/\b(sum|avg|count|min|max|group_concat)\b\(/i", $GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key])))
							&& !((substr($key,0,1) == "u") # and not an Update statement with aggregates enclosed
							    && preg_match("/\b(sum|avg|count|min|max|group_concat)\b\(/i", $GLOBALS["STORED_REPS"][$id][REP_COL_SET][substr($key,1)])))
    					{
    					    #trace("($key) group by ".$fields[$key]." or ".$names[$key]." which is ".$GLOBALS["STORED_REPS"][$id][REP_COL_SET][substr($key,1)]);
    						if(isset($group))
    						{
    							$group .= ", ";
    							$groupBy[$master] .= ", ";
    						}
    						else
    							$group = $groupBy[$master] = "GROUP BY ";
    						$group .= substr($names[$key],0,1) == "'" ? $fields[$key] : $names[$key]; # Fix a mysql bug https://bugs.mysql.com/bug.php?id=14019
    						
    						//mywrite("fields $key => $value names:".$names[$key]." fields: ".$fields[$key]." display: ".$fieldsAll[$key]." ".$fieldsName[$key]);
    						$groupBy[$master] .= substr($displayName[$key],0,1) == "'" ? $fieldsAll[$key] : $fieldsName[$key]; # Fix a mysql bug https://bugs.mysql.com/bug.php?id=14019
    					}
# Construct the HAVING clause, if applicable
			$GLOBALS["CONDS"] = array();
			foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
			{
				# Fill in the array of conditions for Construct_WHERE()
				if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_HAV_FR][$key]))
					$GLOBALS["CONDS"][$key]["FR"] = $GLOBALS["STORED_REPS"][$id][REP_COL_HAV_FR][$key];
				if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_HAV_TO][$key]))
					$GLOBALS["CONDS"][$key]["TO"] = $GLOBALS["STORED_REPS"][$id][REP_COL_HAV_TO][$key]; 
				if(isset($GLOBALS["CONDS"][$key]))  # If we got some having conditions
				{
					$typ = $GLOBALS["STORED_REPS"][$id]["types"][$key];
					$GLOBALS["REV_BT"][$GLOBALS["STORED_REPS"][$id]["types"][$key]] = $GLOBALS["STORED_REPS"][$id]["base_out"][$key];
					$GLOBALS["where"] = "";
					Construct_WHERE($typ, $GLOBALS["CONDS"][$key], 1, FALSE);
					if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key]))
						$names[$key] = $fields[$key];
					if(isset($having))
					{
#						$having .= str_replace("a$typ.val", $names[$key], $GLOBALS["where"]);
						$having .= str_replace("a$typ.val", substr($displayName[$key],0,1) == "'" ? $fieldsAll[$key] : $fieldsName[$key], $GLOBALS["where"]);
					}
					else	# Cut first AND added by Construct_WHERE()
					{
#						$having = " HAVING ".substr(str_replace("a$typ.val", $names[$key], $GLOBALS["where"]), 4);
						$having = " HAVING ".substr(str_replace("a$typ.val", substr($displayName[$key],0,1) == "'" ? $fieldsAll[$key] : $fieldsName[$key], $GLOBALS["where"]), 4);
					}
				}
			}
#print_r($GLOBALS);print($having."\n");die($having1);
# Construct the ORDER BY clause, if applicable
			if(isset($_REQUEST["ORDER"]))
			{
		        $select = explode(",", $_REQUEST["ORDER"]);
    			trace("Order get: ".print_r($select, TRUE));
                foreach($select as $k => $v)
                {
                    if(substr($v,0,1)=="-")
                    {
                        $v = substr($v,1);
                        $desc = " DESC";
                    }
                    else
                        $desc = "";
                    if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]))
                    {
                        $col = $GLOBALS["STORED_REPS"][$id]["columns_flip"][$v];
                        $key = $fields[$col];
                        trace("_ field $v ($col) found: $key type: ".$GLOBALS["STORED_REPS"][$id]["base_out"][$col]);
                        $tmp = isset($displayVal[$col]) ? $displayVal[$col] : $fields[$col];
						if($GLOBALS["STORED_REPS"][$id]["base_out"][$col] == "NUMBER" || $GLOBALS["STORED_REPS"][$id]["base_out"][$col] == "SIGNED"){
						    $key = "CAST(". $key." AS DOUBLE)";
						    $tmp = "CAST(". $tmp." AS DOUBLE)";
						}
            			trace("Order $col: $tmp $desc");
						$sortByArr[$key] = "$tmp $desc";
    					if(isset($order))
    						$order .= ", $key $desc";
    					else
    						$order = "ORDER BY $key $desc";
                    }
                }
    			trace("order set: $order");
            }
            elseif(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SORT]))
			{
				foreach($GLOBALS["STORED_REPS"][$id][REP_COL_SORT] as $key => $value)
				{
					unset($GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key]);
					if(strlen($value))
					{	# In case the field is hidden, use its real expression, not alias
/*						if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key]) || !isset($field_names[$key]))
							$key = $fields[$key];
						else
*/
    					if($GLOBALS["STORED_REPS"][$id]["base_out"][$key] == "NUMBER" || $GLOBALS["STORED_REPS"][$id]["base_out"][$key] == "SIGNED")
    					    $key = "CAST(".(isset($GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key])?$GLOBALS["STORED_REPS"][$id]["aggrs2sort"][$key]
    					                                                                :$fields[$key])." AS DOUBLE)";
                        else
    						$key = $fields[$key];
            			trace("order: $key");
						if($value < 0)
							$GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key." DESC"] = -$value;
						else
							$GLOBALS["STORED_REPS"][$id][REP_COL_SORT][$key] = $value;
					}
				}
				array_multisort($GLOBALS["STORED_REPS"][$id][REP_COL_SORT]);
				foreach($GLOBALS["STORED_REPS"][$id][REP_COL_SORT] as $key => $value)
				{
					if(isset($order))
						$order .= ", $key";
					else
						$order = " ORDER BY $key";
				}
				ksort($sortByArr);
			}
# Save field names
			ksort($names);
			$GLOBALS["STORED_REPS"][$id]["names"] = $names;
# Gather all SQL parts into one string
			$filter = isset($filters) ? implode(" ", $filters) : "";
			$masterFilter = isset($masterFilters) ? implode(" ", $masterFilters) : "";
			
			$field = implode(",",$field_names);
			$cond = implode(" ", $conds);
			$sql = implode(" ", $tables);
# Check if we got some WHERE parameters
			if($exe && (isset($_REQUEST["WHERE"]) || isset($GLOBALS["STORED_REPS"][$id]["params"][REP_WHERE])))
			    if(strlen(trim($where = isset($_REQUEST["WHERE"]) ? $_REQUEST["WHERE"] : $GLOBALS["STORED_REPS"][$id]["params"][REP_WHERE])))
    			    $filter .= strtoupper(substr($where, 0, 3)) == "AND" ? " $where" : " AND $where";
# Fill in the field set with built-in and request values, if any
			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $field, $builtins);
			foreach($builtins[0] as $builtin)
				if(BuiltIn($builtin) != $builtin)
					$field = str_replace($builtin, BuiltIn($builtin), $field);
			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $field, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($_REQUEST[$_req]) && ($_req != ""))
					$field = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $field);
			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $field, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
					$field = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $field);
            
			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $filter, $builtins);
			foreach($builtins[0] as $builtin)
				if(BuiltIn($builtin) != $builtin)
					$filter = str_replace($builtin, BuiltIn($builtin), $filter);
			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $filter, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($_REQUEST[$_req]))
					$filter = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $filter);
			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $filter, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
					$filter = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $filter);
			preg_match_all("/_parent_\.([0-9a-zA-Z\_]+)/ims", $filter, $builtins);
			foreach($builtins[1] as $k => $_req){
				$parent = $blocks[$cur_block]["PARENT"];
				trace($builtins[0][$k]." $filter");
    			unset($item);
				while(!isset($item))	# Seek the parent's var up to the main block
					if(isset($blocks[$parent]["CUR_VARS"][strtolower($_req)])){
						$item = $blocks[$parent]["CUR_VARS"][strtolower($_req)];	# Got it
						break;
					}
					elseif(isset($blocks[$parent]["PARENT"]))
						$parent = $blocks[$parent]["PARENT"];	# Go upper
					else
						break;
				trace($builtins[0][$k]." found $item".isset($item));
				if(isset($item)){
				    $GLOBALS["NO_CACHE"] = ""; // DO not cache this for we might have the parent changed
    				$filter = str_replace($builtins[0][$k], $item, $filter);
    				$masterFilter = str_replace($builtins[0][$k], $item, $masterFilter);
				}
				trace("filter $filter ");
			}
			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", implode(" ", $fieldsAll), $builtins);
			foreach($builtins[0] as $builtin)
				if(BuiltIn($builtin) != $builtin)
					$fieldsAll = str_replace($builtin, BuiltIn($builtin), $fieldsAll);
			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", implode(" ", $fieldsAll), $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($_REQUEST[$_req]))
					$fieldsAll = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $fieldsAll);
			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", implode(" ", $fieldsAll), $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
					$fieldsAll = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $fieldsAll);
            
			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", implode(" ", $joinedOn), $builtins);
			foreach($builtins[0] as $builtin)
				if(BuiltIn($builtin) != $builtin)
					$joinedOn = str_replace($builtin, BuiltIn($builtin), $joinedOn);
			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", implode(" ", $joinedOn), $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($_REQUEST[$_req]))
					$joinedOn = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $joinedOn);
			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", implode(" ", $joinedOn), $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
					$joinedOn = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $joinedOn);
            
            $tmp = "";
            foreach($joined as $k => $v)
                $tmp .= implode(" ", $v);
			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $tmp, $builtins);
			foreach($builtins[0] as $builtin)
				if(BuiltIn($builtin) != $builtin)
				    foreach($joined as $k => $v)
    					$joined[$k] = str_replace($builtin, BuiltIn($builtin), $joined[$k]);
			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $tmp, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($_REQUEST[$_req]))
				    foreach($joined as $kk => $v)
    					$joined[$kk] = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $joined[$kk]);
			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $tmp, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
				    foreach($joined as $kk => $v)
    					$joined[$kk] = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $joined[$kk]);

			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $masterFilter, $builtins);
			foreach($builtins[0] as $builtin)
				if(BuiltIn($builtin) != $builtin)
					$masterFilter = str_replace($builtin, BuiltIn($builtin), $masterFilter);
			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $masterFilter, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($_REQUEST[$_req]))
					$masterFilter = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $masterFilter);
			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $masterFilter, $builtins);
			foreach($builtins[1] as $k => $_req)
				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
					$masterFilter = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $masterFilter);
			
			if(isset($order))
			{
    			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $order, $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($_REQUEST[$_req]))
    					$order = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $order);
    			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $order, $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
    					$order = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $order);
    			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $order, $builtins);
    			foreach($builtins[0] as $builtin)
    				if(BuiltIn($builtin) != $builtin)
    					$order = str_replace($builtin, BuiltIn($builtin), $order);
    			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", implode(",", $sortByArr), $builtins);
    			foreach($builtins[0] as $builtin)
    				if(BuiltIn($builtin) != $builtin)
    					$sortByArr = str_replace($builtin, BuiltIn($builtin), $sortByArr);
			}
			if(isset($group))
			{
    			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $group, $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($_REQUEST[$_req]))
    					$group = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $group);
    			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $group, $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
    					$group = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $group);
    			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $group, $builtins);
    			foreach($builtins[0] as $builtin)
    				if(BuiltIn($builtin) != $builtin)
    					$group = str_replace($builtin, BuiltIn($builtin), $group);
    			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", implode(",", $groupBy), $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($_REQUEST[$_req]))
    					$groupBy = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $groupBy);
    			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", implode(",", $groupBy), $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
    					$groupBy = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $groupBy);
    			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", implode(",", $groupBy), $builtins);
    			foreach($builtins[0] as $builtin)
    				if(BuiltIn($builtin) != $builtin)
    					$groupBy = str_replace($builtin, BuiltIn($builtin), $groupBy);
			}
			if(isset($having))
			{
    			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", $group, $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($_REQUEST[$_req]))
    					$group = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $group);
    			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", $group, $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
    					$group = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $group);
    			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", $group, $builtins);
    			foreach($builtins[0] as $builtin)
    				if(BuiltIn($builtin) != $builtin)
    					$group = str_replace($builtin, BuiltIn($builtin), $group);
    			preg_match_all("/_request_\.([0-9a-zA-Z\_]+)/ims", implode(",", $groupBy), $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($_REQUEST[$_req]))
    					$groupBy = str_replace($builtins[0][$k], addslashes($_REQUEST[$_req]), $groupBy);
    			preg_match_all("/_global_\.([0-9a-zA-Z\_]+)/ims", implode(",", $groupBy), $builtins);
    			foreach($builtins[1] as $k => $_req)
    				if(isset($GLOBALS["GLOBAL_VARS"][$_req]))
    					$groupBy = str_replace($builtins[0][$k], $GLOBALS["GLOBAL_VARS"][$_req], $groupBy);
    			preg_match_all("/(\[[0-9a-zA-Z\_]+\])/ims", implode(",", $groupBy), $builtins);
    			foreach($builtins[0] as $builtin)
    				if(BuiltIn($builtin) != $builtin)
    					$groupBy = str_replace($builtin, BuiltIn($builtin), $groupBy);
			}
#			print_r($builtins);die($field);
# Check if we got an SQL-injection in the Formula or Set field of a report
			if(preg_match("/(\b(from|select|table)\b)/i", $field.$filter, $match))
				die_info(t9n("[RU]Недопустимое значение вычисляемого поля: нельзя использовать служебные слова SQL. Найдено: ".
				        "[EN]No SQL clause allowed in calculatable fields. Found: ").$match[0]);
# Check if we got a fields set specified in the SELECT parameter
            trace("Fields: ".print_r($fields,true));
			if(isset($_REQUEST["SELECT"]))
			{
                trace("Check if we got field IDs to replace with field values");
            	foreach($fields as $k => $v)
            	{
                	preg_match_all("/:(\d+):/", $v, $cols);
                	if(count($cols[1]))
                	{
            	        trace("IDs to replace: ".print_r($cols, TRUE));
                    	foreach($cols[1] as $f)
                    	    if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]))
                        	{
                    	        trace("replace $f with ".$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]]);
                    	        $field = str_replace(":$f:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]],$field);
                    	        $filter = str_replace(":$f:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]],$filter);
        						if(isset($group))
                        	        $group = str_replace(":$f:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]],$group);
        						if(isset($order))
                        	        $order = str_replace(":$f:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]],$order);
        						if(isset($having))
                        	        $having = str_replace(":$f:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$f]],$having);
                        	}
#                	    if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]))
#            	        $sql = str_replace(":$v:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]],$sql);
                	}
            	}
			}
            trace("New fields: ".print_r($fields,true));
            trace("New field_names: ".print_r($field_names,true));
# Check if we got some subqueries - Reports - try to find them
            trace("Check if we got some subqueries: ".print_r($GLOBALS["STORED_REPS"][$id],true));
			$reps = array_unique(explode("[", $sql.$field.$filter.(isset($having) ? $having : " ").(isset($order) ? $order : " ")));
			array_shift($reps);
			if(count($reps))
				foreach ($reps as $value)
				{
                    trace("_ subquery: $value");
                    $tmp = explode("]", $value);
					$sub_query = array_shift($tmp);
					$bak_id = $id;
#					$block_bak = $block;
					Get_block_data($sub_query, FALSE); # Just get the SQL, no execution
					$id = $bak_id;
#					$block = $block_bak;
					if(isset($GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"]))
					{
#print_r($GLOBALS);print($having."\n");die($having1);
						$field = str_replace('['.$sub_query.']'
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $field);
						$filter = str_replace('\'['.$sub_query.']\''	# The report might be used in WHERE too
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $filter);
						$filter = str_replace('['.$sub_query.']'	# The report might be used in WHERE too
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $filter);
						$masterFilter = str_replace('\'['.$sub_query.']\''	# The report might be used in WHERE too
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $masterFilter);
						$masterFilter = str_replace('['.$sub_query.']'	# The report might be used in WHERE too
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $masterFilter);
						$sql = str_replace('['.$sub_query.']'	# The report might be used in JOIN too
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $sql);
						if(isset($order)){
    						$order = str_replace('['.$sub_query.']'	# and in ORDER
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $order);
    						$sortByArr = str_replace('['.$sub_query.']'
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $sortByArr);
						}
						if(isset($group))
						{
    						$group = str_replace('['.$sub_query.']'	# and in GROUP
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $group);
    						$groupBy = str_replace('['.$sub_query.']'
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $groupBy);
						}
						if(isset($having))
						{
    						$having = str_replace('\'['.$sub_query.']\''	# and in HAVING
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $having);
    						$having = str_replace('['.$sub_query.']'	# and in HAVING
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $having);
						}
						$fieldsAll = str_replace('['.$sub_query.']'
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $fieldsAll);
						$fieldsAll = str_replace('\'['.$sub_query.']\''	# The report might be used in WHERE too
									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
									, $fieldsAll);
            			foreach($joined as $k => $v)
            			{
    						$joined[$k] = str_replace('['.$sub_query.']'
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $joined[$k]);
    						$joined[$k] = str_replace('\'['.$sub_query.']\''	# The report might be used in WHERE too
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $joined[$k]);
    						$joinedOn[$k] = str_replace('['.$sub_query.']'
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $joinedOn[$k]);
    						$joinedOn[$k] = str_replace('\'['.$sub_query.']\''	# The report might be used in WHERE too
    									, "(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")"
    									, $joinedOn[$k]);
            			}
					}
#print_r($GLOBALS);die(":".$rep);
				}
				
# Replace aliases with the real field names for REP_COL_NAME
			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA]))
				foreach($GLOBALS["STORED_REPS"][$id][REP_COL_NAME] as $key => $value)
					if(strlen($value) && isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key]))
					{
					    $key = $GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key];
					    trace("field formula $value to be replaced with $key in $field ");
						$field = str_replace('\'['.$value.']\'', $key, $field); # First replace [FIELD]'s
						$field = str_replace('['.$value.']', $key, $field); # replace numeric [FIELD]'s
						$filter = str_replace('\'['.$value.']\'', $key, $filter); # First replace [FIELD]'s
						$filter = str_replace('['.$value.']', $key, $filter); # replace numeric [FIELD]'s
						$filter = preg_replace("/\b$value\b/u", $key, $filter);
						$masterFilter = str_replace('\'['.$value.']\'', $key, $masterFilter); # First replace [FIELD]'s
						$masterFilter = str_replace('['.$value.']', $key, $masterFilter); # replace numeric [FIELD]'s
						$masterFilter = preg_replace("/\b$value\b/u", $key, $masterFilter);
						if(isset($group))
    						$group = str_replace('['.$value.']', $key, $group);
						if(isset($groupBy))
    						$groupBy = str_replace('['.$value.']', $key, $groupBy);
						if(isset($order))
    						$order = str_replace('['.$value.']', $key, $order); # replace numeric [FIELD]'s
						if(isset($having))
    						$having = str_replace('['.$value.']', $key, $having);
						$sql = str_replace('\'['.$value.']\'', $key, $sql); # replace numeric [FIELD]'s
						$sql = str_replace('['.$value.']', $key, $sql); # replace numeric [FIELD]'s
					}

# Replace aliases with the real field names
			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA]))
				foreach($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA] as $key => $value)
					if(strlen($value) && ($GLOBALS["STORED_REPS"][$id]["types"][$key] != ""))
					{
					    trace("formula $key => $value - to be replaced with ".$fields[$key]." in $field ");
						$field = str_replace('\'['.$value.']\'', $fields[$key], $field); # First replace [FIELD]'s
						$field = str_replace('['.$value.']', $fields[$key], $field); # replace numeric [FIELD]'s
						$field = preg_replace("/\b$value\b/u", $fields[$key], $field);
						$filter = str_replace('\'['.$value.']\'', $fields[$key], $filter); # First replace [FIELD]'s
						$filter = str_replace('['.$value.']', $fields[$key], $filter); # replace numeric [FIELD]'s
						$filter = preg_replace("/\b$value\b/u", $fields[$key], $filter);
						$masterFilter = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $masterFilter); # First replace [FIELD]'s
						$masterFilter = str_replace('['.$value.']', $fieldsOrig[$key], $masterFilter); # replace numeric [FIELD]'s
						$masterFilter = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $masterFilter);
						if(isset($group))
						{
    						$group = str_replace('\'['.$value.']\'', $fields[$key], $group); # First replace [FIELD]'s
    						$group = str_replace('['.$value.']', $fields[$key], $group); # replace numeric [FIELD]'s
    						$group = preg_replace("/\b$value\b/u", $fields[$key], $group);
    						$groupBy = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $groupBy); # First replace [FIELD]'s
    						$groupBy = str_replace('['.$value.']', $fieldsOrig[$key], $groupBy); # replace numeric [FIELD]'s
    						$groupBy = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $groupBy);
						}
						if(isset($order))
						{
    						$order = str_replace('\'['.$value.']\'', $fields[$key], $order); # First replace [FIELD]'s
    						$order = str_replace('['.$value.']', $fields[$key], $order); # replace numeric [FIELD]'s
    						$order = preg_replace("/\b$value\b/u", $fields[$key], $order);
    						$sortByArr = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $sortByArr); # First replace [FIELD]'s
    						$sortByArr = str_replace('['.$value.']', $fieldsOrig[$key], $sortByArr); # replace numeric [FIELD]'s
    						$sortByArr = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $sortByArr);
						}
						if(isset($having)){
    						$having = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $having);
    						$having = str_replace('['.$value.']', $fieldsOrig[$key], $having);
    						$having = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $having);
						}
						$sql = str_replace('\'['.$value.']\'', $fields[$key], $sql); # replace numeric [FIELD]'s
						$sql = str_replace('['.$value.']', $fields[$key], $sql); # replace numeric [FIELD]'s
						
						$fieldsAll = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $fieldsAll); # First replace [FIELD]'s
						$fieldsAll = str_replace('['.$value.']', $fieldsOrig[$key], $fieldsAll); # replace numeric [FIELD]'s
						$fieldsAll = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $fieldsAll);
						if(isset($joinedClause)){
    						$joinedClause = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $joinedClause); # First replace [FIELD]'s
    						$joinedClause = str_replace('['.$value.']', $fieldsOrig[$key], $joinedClause); # replace numeric [FIELD]'s
    						$joinedClause = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $joinedClause);
						}
						$joinedOn = str_replace('\'['.$value.']\'', $fieldsOrig[$key], $joinedOn); # First replace [FIELD]'s
						$joinedOn = str_replace('['.$value.']', $fieldsOrig[$key], $joinedOn); # replace numeric [FIELD]'s
						$joinedOn = preg_replace("/\b$value\b/u", $fieldsOrig[$key], $joinedOn);
					}

# Apply LIMIT value, if set online in the report
            if(isset($_REQUEST["RECORD_COUNT"]))
				$limit = "";
			elseif(isset($GLOBALS["STORED_REPS"][$id]["params"][REP_LIMIT]))	#  or in the report definition
			{
				$limit = "LIMIT ";
				$limits = explode(",", $GLOBALS["STORED_REPS"][$id]["params"][REP_LIMIT]);
				if(isset($_REQUEST["LIMIT"]) && $exe){	# Do not exceed the predefined limit
					$req_limits = explode(",", $_REQUEST["LIMIT"]);
					if(isset($limits[1])){ # Given: offset, limit1
						if(isset($req_limits[1])) # Requested: offset, limit
							$limit .= (int)$req_limits[0] # Requested offset
									.",". min((int)$req_limits[1],(int)$limits[1]); # Min of Given and Requested limit
						else	# Requested: limit
							$limit .= min((int)$req_limits[0],(int)$limits[1]); # Requested offset, given limit
					}
					else{	# Given: limit
						if(isset($req_limits[1])) # Requested: offset, limit
							$limit .= (int)$req_limits[0] # Requested offset
									.",". min((int)$req_limits[1],(int)$limits[0]); # Min of Given and Requested limit
						else	# Requested: limit
							$limit .= min((int)$req_limits[0],(int)$limits[0]); # Requested offset, given limit
					}
				}
				else
					$limit = "LIMIT ".(int)$limits[0].(isset($limits[1]) ? ",".(int)$limits[1] : "");
			}
			elseif(isset($_REQUEST["LIMIT"]) && $exe)
			{
				$limits = explode(",", $_REQUEST["LIMIT"]);
				if((int)$limits[0] >= 0)
    				$limit = "LIMIT ".(int)$limits[0].(isset($limits[1]) ? ",".(int)$limits[1] : "");
    			else
    				$limit = "";
			}
			else
				$limit = "";
# Compile the SELECT
			if(strlen($sql))
				$sql = "SELECT $distinct $field FROM $sql WHERE $cond $filter "
				        . (isset($group) ? $group : " ") . (isset($having) ? $having : " ")
				        . (isset($order) ? $order : " ") . " $limit";
			else	# There are only calculatible fields in the report
				$sql = "SELECT $field " . (strlen($filter) ? " FROM dual WHERE ".substr($filter,4) : "") . $having;
            
            #mywrite("\r\n".$GLOBALS["STORED_REPS"][$id]["header"]);
		    if(strlen($sql)){
		        if($exe)
                   	mywrite("\r\n$sql");
#              	mywrite("$field");
    		    $sql = "";
    		    foreach($displayVal as $k => $v) # Any field alias should be taken at most once
    		        if(mb_substr($fieldsAll[$k],-strlen($displayName[$k])-1) !== " ". $displayName[$k])
            		    $sql .= "," . $fieldsAll[$k] .($fieldsAll[$k] !== "" && isset($displayName[$k]) ? " as " : " "). $displayName[$k];
        		    else
            		    $sql .= "," . $fieldsAll[$k];
				  
        		$sql = "SELECT $distinct " . substr($sql, 1);
        		if(!empty($tables[$master])){
        		    $sql .= "\r\nFROM ".$tables[$master];
        		    if(isset($joinedJoin["$p$master"]))
            			foreach($joinedJoin["$p$master"] as $j)
        	    		    $sql .= "\r\n   $j";
        			foreach($joined as $k => $v)
        			{
        			    //trace(var_dump($joined[$k]));
        			    if($k != "$p$master")
                		    $sql .= "\r\n  LEFT JOIN (SELECT ".implode(",", $joined[$k]);
            		    if(isset($joinedFrom[$k]))
                		    $sql .= "\r\n  ".$joinedFrom[$k];
            		    if(($k != "$p$master") && isset($joinedJoin[$k]))
                			foreach($joinedJoin[$k] as $j)
            	    		    $sql .= "\r\n   $j";
        	    		    
            		    if(isset($joinedClause[$k]))
            		    {
                		    $sql .= "\r\n   ".$joinedClause[$k];
                		    if(preg_match("/\b(sum|avg|count|min|max|group_concat)\b\(/i", implode(",",$joined[$k])))
                                foreach($joined[$k] as $gr)
                                    if(!preg_match("/\b(sum|avg|count|min|max|group_concat)\b\(/i", $gr))
                                    {
                						$tmp = explode(" ", $gr);
                						$gr = array_pop($tmp);
                                        if(isset($groupBy[$k]))
                                            $groupBy[$k] .= ",$gr";
                                        else
                                            $groupBy[$k] .= "GROUP BY $gr";
                                    }
                            if(isset($groupBy[$k]))
                    		    $sql .= "\r\n   ".$groupBy[$k];
            		    }
            		    if(isset($joinedOn[$k]))
                		    $sql .= "\r\n   ".$joinedOn[$k];
        			}
        		}
        		if(strlen(trim($cond.$masterFilter)) > 0)
        		    $sql .= "\r\nWHERE $cond $masterFilter ";
    		    $sql .= (isset($groupBy[$master]) ? "\r\n".$groupBy[$master] : " ") . (isset($having) ? $having : " ")
    				        . (isset($sortByArr) ? "\r\nORDER BY ".implode(",", $sortByArr) : " ") . " $limit";
                
		    }
			else	# There are only calculatible fields in the report
				$sql = "SELECT $field " . (strlen($filter) ? " FROM dual WHERE ".substr($filter,4) : "") . $having;

	        if($exe)
                mywrite("\r\n$sql");

			if(isset($_REQUEST["SELECT"]))
			{
            	preg_match_all("/:(\d+):/", $sql, $cols); # Check if we got field IDs to replace with field values
            	foreach($cols[1] as $k => $v)
            	    if(isset($GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]))
            	        $sql = str_replace(":$v:",$fields[$GLOBALS["STORED_REPS"][$id]["columns_flip"][$v]],$sql);
            	trace("IDs to replace: ".print_r($cols, TRUE));
			}
# Save the Report, it might be required again this session
			$GLOBALS["STORED_REPS"][$id]["sql"] = $sql;
		}
	}
	# RECURSIVE Replace the whole query in case we have RECURSIVE here (just one first column)
    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][1]) && ($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][1] === "RECURSIVE")){
        unset($cond);
        trace("RECURSIVE");
        trace("masterFilter $masterFilter");
        $fr = str_replace(" ", "_", $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][1]);
        if(!isset($_REQUEST["FR_$fr"])){
            if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_FROM][1]))
                $cond = "AND id IS NOT NULL";
            elseif(preg_match("/^\[(.+)\]$/", $GLOBALS["STORED_REPS"][$id][REP_COL_FROM][1], $m)){
                $sub_query = $m[1];
    			$bak_id = $id;
    			Get_block_data($sub_query, FALSE); # Just get the SQL, no execution
    			$id = $bak_id;
    			if(isset($GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"]))
                    $cond = "AND id IN(".$GLOBALS["STORED_REPS"][$GLOBALS["STORED_REPS"][$sub_query]["_rep_id"]]["sql"].")";
            }
        }
        $typ = $GLOBALS["STORED_REPS"][$id]["types"][1];
        if(!isset($cond))
            $cond = preg_replace("/a.+?\.(val|id)/", "id", $masterFilter, 1);
		if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_NAME][1]))
			$name = "'".str_replace("'", "\\'", $GLOBALS["STORED_REPS"][$id][REP_COL_NAME][1])."'";
		else
			$name = "id";
		if(isset($GLOBALS["STORED_REPS"][$id]["references"][$typ][$typ])) // This is a reference attribute
    		$GLOBALS["STORED_REPS"][$id]["sql"] = " WITH RECURSIVE c AS (SELECT id, 0 t FROM $z WHERE t=$typ AND up!=0 $cond"
                    ."  UNION SELECT ref.up id, ref.t FROM $z ref INNER JOIN c ON c.id=ref.t WHERE ref.val='"
                                .$GLOBALS["STORED_REPS"][$id]["references"][$typ][$typ]."')"
                    ." SELECT DISTINCT id $name FROM c";
        else    // This is a dependent table items
    		$GLOBALS["STORED_REPS"][$id]["sql"] = " WITH RECURSIVE c AS (SELECT id, 0 t FROM $z WHERE t=$typ AND up!=0 AND val!='' $cond"
                    ."  UNION SELECT ref.id id, ref.t FROM $z ref INNER JOIN c ON c.id=ref.up WHERE ref.t=$typ)"
                    ." SELECT DISTINCT id $name FROM c";
        trace("RECURSIVE ".$GLOBALS["STORED_REPS"][$id]["sql"]);
        mywrite("\r\n".$GLOBALS["STORED_REPS"][$id]["sql"]);
	}
# Return in case we construct a sub-query
	if(!$exe){
		if(isset($GLOBALS["STORED_REPS"][$id]["params"][REP_IFNULL]))	# Apply IF_NULL value, if set
			$GLOBALS["STORED_REPS"][$id]["sql"] = "COALESCE((".$GLOBALS["STORED_REPS"][$id]["sql"]."),"
															.$GLOBALS["STORED_REPS"][$id]["params"][REP_IFNULL].")";
        trace("NO EXEC OF $id");
		return;
	}
    trace("EXEC OF $id");
# The query is already prepared - just replace the IDs in it, if any
	foreach($_REQUEST as $key => $value)
		if((substr($key, 0, 1) == "i") && ((int)$value != 0))
			$GLOBALS["STORED_REPS"][$id]["sql"] = str_replace("%".substr($key, 1)."_OBJ_ID%", (int)$value, $GLOBALS["STORED_REPS"][$id]["sql"]);

   	$sql = $GLOBALS["STORED_REPS"][$id]["sql"];
	if(isset($GLOBALS["NO_CACHE"]))	# There were insertion points from the current parent block, do not cache the SQL
		unset($GLOBALS["STORED_REPS"][$id]["sql"]);
	elseif($sql == $GLOBALS["STORED_REPS"][$id]["sql"]) # Check if we got changes in the SQL since the last build (Obj ID or something)
	{
		if(isset($GLOBALS["STORED_REPS"][$id]["last_res"])){
            trace(" last_res OF $id");
			$blocks["_data_col"][$id] = $GLOBALS["STORED_REPS"][$id]["last_res"];
			if(isset($GLOBALS["STORED_REPS"][$id]["last_totals"])){
    			$blocks["col_totals"][$id] = $GLOBALS["STORED_REPS"][$id]["last_totals"];
                trace(" last_totals OF $id ".$GLOBALS["STORED_REPS"][$id]["last_totals"]);
			}
			return;
		}
		elseif(isset($GLOBALS["STORED_REPS"][$id]["last_res_empty"])){
            trace(" last_res_empty OF $id");
			return;
		}
	}
	if(isset($GLOBALS["TRACE"]))
	    mywrite($sql);
	if(isset($_REQUEST["RECORD_COUNT"]))
	{
	    trace("RECORD_COUNT set");
    	$data_set = Exec_sql("SELECT COUNT(1) FROM ($sql) temp", "Request report data count");
    	if($row = mysqli_fetch_array($data_set))
    	    if(isset($_REQUEST["JSON"]) || isApi() || isset($args["json"]))
            	die('{"count":"'.$row[0].'"}');
    	    else
    	        die($row[0]);
	}
	$data_set = Exec_sql($sql, "Request report data", TRUE, FALSE);
	$rownum = 1;
															 
	$GLOBALS["STORED_REPS"][$id]["last_res_empty"] = 1;
	$GLOBALS["STORED_REPS"][$id]["rownum"] = mysqli_num_rows($data_set);
	foreach($GLOBALS["STORED_REPS"][$id]["names"] as $key => $value)
	    if(substr($value,0,1) == "'")
	    {
	        //trace("mbstrlen ".$value." ".strlen($value)." ".mb_strlen($value)." (".str_replace("\\'", "'", substr($value, 1, strlen($value)-2)).") (".str_replace("\\'", "'", substr($value, 1, mb_strlen($value)-2)).")");
	        $names[$key] = $GLOBALS["STORED_REPS"][$id]["names"][$key] = str_replace("\\'", "'", substr($value, 1, strlen($value)-2));
	    }
	if(gettype($data_set)==="string"){
		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value) # Create error report col
			if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # Not hidden column
			    if(isset($reportedError))
				    $blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["names"][$key]] = Array("");
				else
				    $blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["names"][$key]] = Array($reportedError = $data_set);
	}
	elseif((mysqli_num_rows($data_set) == 0) && isset($GLOBALS["STORED_REPS"][$id]["params"][REP_IFNULL])) # IF_NULL set
	{
		$GLOBALS["STORED_REPS"][$id]["rownum"] = 1;	# Fill in one line of the report with the given IF_NULL values
		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)	# Set IF_NULL value in case of an empty report
			if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # Not hidden column
				$blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["names"][$key]][] = $GLOBALS["STORED_REPS"][$id]["params"][REP_IFNULL];
	}
	elseif(mysqli_num_rows($data_set) == 0) # The rep is empty
	{
		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value) # Create empty report cols
			if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # Not hidden column
				$blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["names"][$key]] = Array();
	}
	else
	while($row = mysqli_fetch_array($data_set)){
	    unset($curLineOld);
		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value){
			if(!isset($names[$key]))
				$names[$key] = $GLOBALS["STORED_REPS"][$id]["names"][$key] = "update";
			$value = $names[$key];
			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # A hidden column
			{
				unset($GLOBALS["STORED_REPS"][$id]["head"][$key]); # Discard this record and fetch the next
				if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_SET][$key]))
					continue; # Nothing more to do here
			}
			$typ = isset($GLOBALS["STORED_REPS"][$id]["types"][$key]) ? $GLOBALS["STORED_REPS"][$id]["types"][$key] : NULL;
			$base_str = isset($GLOBALS["STORED_REPS"][$id]["base_out"][$key]) ? $GLOBALS["STORED_REPS"][$id]["base_out"][$key] : NULL;
			$base = isset($GLOBALS["BT"][$base_str]) ? $GLOBALS["BT"][$base_str] : NULL;
			$val = isset($row[$value]) ? $row[$value] : "";
            if(isset($GLOBALS["STORED_REPS"][$id]["params"][REP_URL]))
    			if(strlen($GLOBALS["STORED_REPS"][$id]["params"][REP_URL]))
    				$cur_line[$key] = $val;

			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]))
				switch($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]) # Internal functions are named abn_XXXX
				{
					case "abn_DATE2STR":
						include_once "include/funcs.php";
						$val = abn_DATE2STR($val);
						$base = $GLOBALS["BT"]["SHORT"]; # Replace the base type with STRING
						break;
					case "abn_NUM2STR":
						include_once "include/funcs.php";
						$val = abn_NUM2STR($val);
						$base = $GLOBALS["BT"]["SHORT"];
						break;
					case "abn_RUB2STR":
						include_once "include/funcs.php";
						$val = abn_RUB2STR($val);
						$base = $GLOBALS["BT"]["SHORT"];
						break;
					case "abn_Translit":
						include_once "include/funcs.php";
						$val = abn_Translit($val);
						$base = $GLOBALS["BT"]["SHORT"];
						break;
					case "abn_ROWNUM":
						$val = $rownum++;
						break;
					case "abn_URL":
					    $curLineOld[$key] = $val;
						$val = $GLOBALS["STORED_REPS"][$id]["params"][REP_URL];
						$post = isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["URL_POST"]) ? $GLOBALS["STORED_REPS"][$id]["rep_params"]["URL_POST"] : "";
                        trace("curl_exec POST=($post)");
						if(isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["URL_HEADER"]))
						    $headers = $GLOBALS["STORED_REPS"][$id]["rep_params"]["URL_HEADER"];
						else
						    $headers = "User-Agent: Integram, Content-Type: application/json; charset=utf-8, Accept: */*";
						if(strlen($val) && !isset($file_failed)){
                            $host=strtolower(parse_url($val, 1));
                            if($host === "localhost") # (strtolower($_SERVER["HTTP_HOST"]) === $host) || 
                                   # || ((false !== filter_var($host, FILTER_VALIDATE_IP)) && (false === filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))))
                                $val = $file_failed = "You cannot access your own server!";
							elseif(substr(parse_url($val, 0), 0, 4) == 'http'){
								if(is_array($GLOBALS["STORED_REPS"][$id][REP_COL_NAME]))
									foreach($GLOBALS["STORED_REPS"][$id][REP_COL_NAME] as $i => $a){
										if(strpos($post, "[$a]"))
											$post = str_replace("[$a]", $cur_line[$i], $post);
										if(strpos($val, "[$a]"))
											$val = str_replace("[$a]", rawurlencode($cur_line[$i]), $val);
										if(strpos($headers, "[$a]"))
											$headers = str_replace("[$a]", $cur_line[$i], $headers);
									}
#print_r($GLOBALS);die($_SERVER["HTTP_HOST"].":".parse_url($val, 1));
                                $hash = sha1($val.$post.$headers);
                                trace("curl_exec headers $headers");
    						    $headers = explode(",", $headers);
    						    $a = array_map('trim', array_keys($headers));
                                $b = array_map('trim', $headers);
                                $headers = array_combine($a, $b);
                                if(isset($GLOBALS["STORED_REPS"][$id]["CURL_EXECS"])
                                        &&isset($GLOBALS["STORED_REPS"][$id]["CURL_EXECS"][$hash])){
                                    trace("curl_exec reuse $hash");
                                    $val = $GLOBALS["STORED_REPS"][$id]["CURL_EXECS"][$hash];
                                }
                                else{
                                    trace("curl_exec $val ($post)");
    								$ch = curl_init();
    								curl_setopt($ch, CURLOPT_HEADER, 0);
    								curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    								if(isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["URL_METHOD"])){
    								    $method = strtoupper($GLOBALS["STORED_REPS"][$id]["rep_params"]["URL_METHOD"]);
    								    if(in_array($method, array("GET","PUT","POST","DELETE","PATCH","HEAD","OPTIONS","TRACE"))){
            								curl_setopt($ch, CURLOPT_CUSTOMREQUEST, $method);
                                            trace(" method $method");
    								    }
    								}
    								if($post !== ""){
                                        trace(" curl_exec post");
                                        curl_setopt($ch, CURLOPT_POST, 1);
                                        curl_setopt($ch, CURLOPT_POSTFIELDS, strpos($post, "=@/") || strpos($post, "=@http") ? build_post_fields($post) : $post);
    								}
            						if(isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["CURLOPT_SSL_VERIFYPEER"])){
            						    trace("CURLOPT_SSL_VERIFYPEER ".(int)$GLOBALS["STORED_REPS"][$id]["rep_params"]["CURLOPT_SSL_VERIFYPEER"]);
            						    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, (int)$GLOBALS["STORED_REPS"][$id]["rep_params"]["CURLOPT_SSL_VERIFYPEER"]);
            						}
    								curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    								curl_setopt($ch, CURLOPT_VERBOSE, true);
                                    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0);
                                    curl_setopt($ch, CURLOPT_CAINFO, "/var/www/isboxon1/data/www/etc/ssl/certs/cacert.pem");
                                    #curl_setopt($ch, CURLOPT_CAPATH, "/var/www/isboxon1/data/www/etc/ssl/certs/cacert.pem");
                                    #curl_setopt($ch, CURLOPT_FAILONERROR, true);
    								curl_setopt($ch, CURLOPT_URL, $val);
    								curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    								$GLOBALS["STORED_REPS"][$id]["CURL_EXECS"][$hash] = curl_exec($ch);
								    $GLOBALS["STORED_REPS"][$id]["CURLINFO_HTTP_CODE"][$hash] = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    								if(trim($GLOBALS["STORED_REPS"][$id]["CURL_EXECS"][$hash]) === "")
    								    $GLOBALS["STORED_REPS"][$id]["CURL_EXECS"][$hash] = $GLOBALS["STORED_REPS"][$id]["CURLINFO_HTTP_CODE"][$hash];
    								$curl = $val = $GLOBALS["STORED_REPS"][$id]["CURL_EXECS"][$hash];
                                    trace("curl_exec result: $val");
    								if(curl_errno($ch)){
    									$val = curl_errno($ch).":".curl_error($ch).": $val";
                                        trace(print_r(curl_getinfo($ch), true));
    									$file_failed = true;
    								}
    								curl_close($ch);
                                }
							}
							else
								$val = $file_failed = "URL must use https or http";
						}
						break;
				}
#			trace("Format $val base:$base - base_str:$base_str id:".$row["i$key"]);
			if(isset($GLOBALS["STORED_REPS"][$id]["params"][REP_HREFS]) && isset($names["i$key"])
					&& !isset($GLOBALS["STORED_REPS"]["parents"][$typ]))	# Make HREFS in case of interactive report
			{
				if(($base_str == "PATH") || ($row["i$key"] < 2))
					$val = "<span>".Format_Val_View($base, $val, $row["i$key"])."</span>";
				else
					$val = "<a target=\"$key\" href=\"/$z/edit_obj/".$row["i$key"]."\">".Format_Val_View($base, $val, $row["i$key"])."</a>";
			}
			elseif($base_str == "PATH")
				$val = strlen($val) ? Format_Val_View($base, $val, $row["i$key"]) : "";
			elseif($base_str == "HTML")
				$val = strlen($val) ? str_ireplace("{_global_.z}", $z, $val) : "";
			elseif($base_str == "FILE")
				$val = strlen($val) ? Format_Val_View($base, $val, $row["i$key"]) : "";
			else
				$val = strlen($val) ? htmlspecialchars(Format_Val_View($base, $val)) : "";
            # Check if we try to fetch a JSON key
    		if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA])){
    		    unset($curlVal);
    		    if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key])){
    		        $setVal = $GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA][$key];
                    if(isset($curl) && (substr($setVal, 0, 5) === "CURL."))
        				$curlVal = getJsonVal(substr($setVal, 5), $curl);
                    elseif(isset($curl) && (substr($setVal, 0, 6) === "'CURL."))
        				$curlVal = getJsonVal(substr($setVal, 6, -1), $curl);
        			elseif((strtoupper(substr($setVal, 0, 5)) === "JSON.") && (mb_strpos(strtoupper($val), strtoupper(substr($setVal, 5))) !== FALSE))
        				$curlVal = checkJson(substr($setVal, 5), $val);
    		    }
    		    if(isset($curlVal) && ($curlVal !== $val)){
    		        $curLineOld[$key] = $val;
    		        $val = $curlVal;
    		    }
    		}
			$blocks["_data_col"][$id][$value][] = $cur_line[$key] = $val;

#print_r($GLOBALS["STORED_REPS"][$id]["head"]);print_r($blocks["_data_col"][$id]);print_r($GLOBALS);die();
# Count totals for the Column
            if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL])){
                if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL][$key])){
    				switch(strtoupper($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL][$key])){
    					case "COUNT":
    						if(isset($blocks["col_totals"][$id][$value]))
    							$blocks["col_totals"][$id][$value] = $blocks["col_totals"][$id][$value] + 1;
    						else
    							$blocks["col_totals"][$id][$value] = 1;
    						break;
    					case "AVG":
    					case "SUM":
							$blocks["col_totals"][$id][$value] = (isset($blocks["col_totals"][$id][$value]) ? $blocks["col_totals"][$id][$value] : 0)
							                                    + floatval($row[$value]);
    						break;
    					case "MIN":
    						if(isset($blocks["col_totals"][$id][$value]))
    							if($blocks["col_totals"][$id][$value] > $row[$value])
    								$blocks["col_totals"][$id][$value] = $row[$value];
    						break;
    					case "MAX":
    						if(isset($blocks["col_totals"][$id][$value]))
    							if($blocks["col_totals"][$id][$value] < $row[$value])
    								$blocks["col_totals"][$id][$value] = $row[$value];
    						break;
    					default:	# Wrong TOTAL function name
    						$blocks["col_totals"][$id][$value] = "".$GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL][$key];
    						break;
    				}
        			if(!isset($blocks["col_totals"][$id][$value])) // The first value for AVG, MIN, etc
        				$blocks["col_totals"][$id][$value] = $row[$value];
    			}
    			if(!isset($blocks["col_totals"][$id][$value]))
    				$blocks["col_totals"][$id][$value] = "";
            }
		}
# Prepare the UPDATE list
		if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_SET])){
			while(!isset($ready)){
				$ready = 0;	# Assume, we got all the ID links for new records
				$progress = FALSE;	# Some more records created this round
				$rec = count($blocks["_data_col"][$id]["update"])-1;	# Save the line number of the report to show the result there
				foreach($GLOBALS["STORED_REPS"][$id][REP_COL_SET] as $key => $setVal){
				    trace("REP_COL_SET $key => $setVal / ");
				    if($setVal === "[THIS]")
        				$row["u$key"] = end($blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["head"][$key]]);
				    elseif(isset($curl) && (substr($setVal, 1, 5) === "CURL."))
        				$row["u$key"] = getJsonVal(substr($setVal, 6, -1), $curl);
    				elseif(preg_match("/^substring\(\[THIS\],(-*\d+)\)$/mi", $setVal, $substr)){
        				$row["u$key"] = mb_substr(end($blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["head"][$key]]),$substr[1]);
    				    trace("row[ukey] ".$row["u$key"]);
    				}
    				elseif(preg_match("/^substring\(\[THIS\],(-*\d+),(-*\d+)\)$/mi", $setVal, $substr)){
        				$row["u$key"] = mb_substr(end($blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["head"][$key]]),$substr[1],$substr[2]);
    				    trace("row[ukey] ".$row["u$key"]);
    				}
					$typ = $GLOBALS["STORED_REPS"][$id]["types"][$key];
					$parent = isset($GLOBALS["STORED_REPS"]["parents"][$typ]) ? $GLOBALS["STORED_REPS"]["parents"][$typ] : 0;
					if($new = ($row["i$key"] == 0))	# Is it a new rec?
					{
						$o = 1;
						if($parent == 0)	# We are parent
						{
        				    trace("_ We are parent");
							if(isset($GLOBALS["STORED_REPS"][$id]["PARENT"][$typ]))	# and somebody's array Req
							{	# Get our parent's ID
								$u = $row["i".$GLOBALS["STORED_REPS"][$id]["PARENT"][$typ]];
								$o = 0; # We'll need the Order value
							}
							else	# we are no one's Req
								$u = 1;
						}
						else	# We are a Req
																	 
							$u = $row["i$parent"];
	   
						
						if($u == 0)	# Our parent doesn't exist yet
						{
        				    trace("_ Our parent doesn't exist yet");
        				    if(isset($blocks["_update"]))
                                foreach($blocks["_update"] as $upd => $col) // Find the column where our parent is being created
                                    if(isset($col["t"]))
                                        if(isset($col["t"][$rec]))
                                            if(($col["t"][$rec] == $parent) && isset($col["new_id"][$rec]))
                                            {
                            				    trace("__ Our parent will be");
                								$u = $upd."_".$col["new_id"][$rec];
                            				    trace("__ Our parent will be $u");
                								$new_id_needed[$u] = "";	# Mark the parent ID required to save for it's Up for our Req
                								break;
                                            }
							if($u == 0) // If no parent to be created, though we need a parent ID for this Req
							{
            				    trace("__ no parent to be created, though we need a parent ID for this Req");
								unset($ready);
								continue;	# skip it and process the next
							}
						}
						$i = $u;
						if(!isset($blocks["_update"][$key]["id"][$i]))
							$blocks["_update"][$key]["new_id"][$rec] = $i;	# Form the Link to new ID, in case we'll need it
					}
					else
						$i = $row["i$key"];

					if(isset($blocks["progress"][$key]["id"][$i]))	# The UPDATE params were already prepared for this record
						continue;
                    trace("_ $rec The value to set is row[u".$key."]=".$row["u$key"]);
					$progress = TRUE;
					$blocks["progress"][$key]["id"][$i] = true;
					$blocks["_update"][$key]["id"][$i] = $rec;
					if($row["u$key"] == "")
					{
						if($new) # Do we have a Value to delete?
							unset($blocks["_update"][$key]["id"][$i]);
						else{
							$blocks["_update"][$key]["delete"][$rec] = "";
							$blocks["_data_col"][$id]["update"][$rec] .= "<s>".$GLOBALS["STORED_REPS"][$id]["head"][$key]."</s> (удалить)<br>";
						}
						continue;
					}
					if($new){	# No need to save Up and Ord for UPDATE statement
						$blocks["_update"][$key]["up"][$rec] = $u;
						$blocks["_update"][$key]["ord"][$rec] = $o;
					}
					if(isRef($id, $par, $typ)){
						$refOrig = $GLOBALS["STORED_REPS"][$id]["ref_typ"][$typ];
    				    trace("Our type is ".$row["u$key"]." orig is $refOrig");
    				    if(!isset($dsRefs[$row["u$key"]]))
    				        if(is_numeric($row["u$key"]))
                            	if($dsRef = mysqli_fetch_array(Exec_sql("SELECT val FROM $z WHERE t=$refOrig AND up>0 AND id=".$row["u$key"], "Seek Ref by ID")))
                            	    $dsRefs[$row["u$key"]] = $dsRef["val"];
    				    if(!isset($dsRefs[$row["u$key"]]))
    						$blocks["_data_col"][$id]["update"][$rec] .= $GLOBALS["STORED_REPS"][$id]["head"][$key].": <s>#".$row["u$key"]."</s> (invalid)<br>";
    					else{
    						$blocks["_update"][$key]["t"][$rec] = $row["u$key"];
    						if($new)
    							$blocks["_update"][$key]["val"][$rec] = $typ;
    						# We'll show the pre-Update advice: what's added/changed during this UPDATE
    						$blocks["_data_col"][$id]["update"][$rec] .= $GLOBALS["STORED_REPS"][$id]["head"][$key].($new ? ": #"
    						        : ": ".$blocks["_data_col"][$id][$names[$key]][$rec]." => #").$row["u$key"]." ".$dsRefs[$row["u$key"]]."<br>";
    					}
					}
					else{
						$blocks["_update"][$key]["val"][$rec] = Format_Val($GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_in"][$key]], $row["u$key"]);
						trace("__ formatted value is ".$blocks["_update"][$key]["val"][$rec]);
						trace("__ base type: ".$GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_in"][$key]]);
						/*
						if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA])) # We might have formulas to replace the value
							if($i = array_search($setVal, $GLOBALS["STORED_REPS"][$id][REP_COL_FORMULA])) # Replace the value, if we found the formula
								$blocks["_update"][$key]["val"][$rec] = Format_Val($GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_in"][$key]], $cur_line[$i]);
						*/
						trace("__ formula applied, value is ".$blocks["_update"][$key]["val"][$rec]);
						$blocks["_data_col"][$id]["update"][$rec] .= $GLOBALS["STORED_REPS"][$id]["head"][$key].(substr($fields[$key],-4)===".ord"?" (ORD): ":": ");
						if($new)
							$blocks["_update"][$key]["t"][$rec] = $GLOBALS["STORED_REPS"][$id]["types"][$key];
						else # Indicate the old Value in the pre-Update advice
							$blocks["_data_col"][$id]["update"][$rec] .= $blocks["_data_col"][$id][$names[$key]][$rec]." => ";

						$blocks["_data_col"][$id]["update"][$rec] .= Format_Val_View($GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_out"][$key]]
																					, $blocks["_update"][$key]["val"][$rec])."<br>";
					}
				}
				if(!isset($ready) && !$progress)	# We still need new IDs links, but no links created this round - no hope
					$ready = 0;	//	die_info("Не могу найти родительский ID");
			}
			unset($ready);
		}
	}
# Execute UPDATEs
    trace("UPDATEs ".(isset($blocks["_update"]) ? count($blocks["_update"]) : 0));
    trace("parents ".print_r($GLOBALS["STORED_REPS"]["parents"], TRUE));
	if(isset($blocks["_update"]) && (isset($_REQUEST["confirmed"])	# We have a confirmation to UPDATE
                    || isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["EXECUTE"]))){
		if(!isset($GLOBALS["STORED_REPS"][$id]["rep_params"]["EXECUTE"]))
		    check();
		foreach($blocks["_update"] as $key => $value){
    	    trace(" Execute ".count($value["id"]));
			foreach($value["id"] as $i => $n){
        	    trace(" i=$i n=$n key=$key ord[n]=".(isset($value["ord"][$n]) ? $value["ord"][$n] : ""));
                trace("_  The old value for ".$names[$key]." is ".$blocks["_data_col"][$id][$names[$key]][$n]);
                if($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC]&&$GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key]
                        &&$GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$key] == 'abn_URL')
                    $blocks["_data_col"][$id][$names[$key]][$n] = ""; # The old val lost with CURL
                # Replace the old value in the report with the new one
				if(isset($value["ord"][$n]))	# A new record
				{
                    $blocks["_data_col"][$id][$names[$key]][$n] = $value["val"][$n];
				    trace("A new record under ".$value["up"][$n]);
					if(isset($new_id_needed[$value["up"][$n]])) # Fetch the new ID of our parent
						$value["up"][$n] = $new_id_needed[$value["up"][$n]];
					if(isset($new_id_needed[$key."_".$value["new_id"][$n]]))	# Save the new ID in case some Reqs need to know it
						$new_id_needed[$key."_".$value["new_id"][$n]] = Insert($value["up"][$n]
												, $value["ord"][$n] == 0 ? Calc_Order($value["up"][$n], $value["t"][$n]) : $value["ord"][$n]
												, $value["t"][$n], $value["val"][$n], "INSERT new rec, get ID");
					else
						Insert($value["up"][$n], $value["ord"][$n] == 0 ? Calc_Order($value["up"][$n], $value["t"][$n]) : $value["ord"][$n]
									, $value["t"][$n], $value["val"][$n], "INSERT new rec ($n)");
				    trace("  ref ".$GLOBALS["STORED_REPS"][$id]["ref_typ"][$value["val"][$n]]);
    				if(isset($GLOBALS["STORED_REPS"][$id]["ref_typ"][$value["val"][$n]])){
    				    trace("  new ref v=".$value["val"][$n]." t=".$value["t"][$n]." rv=".$dsRefs[$value["val"][$n]]." rt=".$dsRefs[$value["t"][$n]]);
                        $blocks["_data_col"][$id][$names[$key]][$n] = $dsRefs[$value["t"][$n]];
    				}
				}
				elseif(substr($fields[$key],-4)===".ord")
					Exec_sql("UPDATE $z SET ord=".(int)$value["val"][$n]." WHERE id=$i", "UPDATE Ord");
				elseif(isset($value["delete"][$n])){
                    $blocks["_data_col"][$id][$names[$key]][$n] = "";
					Delete($i);
				}
				elseif(!isset($value["val"][$n])){
				    if(($blocks["_data_col"][$id][$names[$key]][$n] !== $dsRefs[$value["t"][$n]]) || isset($curLineOld[$key])){
                        $blocks["_data_col"][$id][$names[$key]][$n] = $dsRefs[$value["t"][$n]];
    					Exec_sql("UPDATE $z SET t=".$value["t"][$n]." WHERE id=$i", "UPDATE Ref");
				    }
				}
				elseif(($blocks["_data_col"][$id][$names[$key]][$n] !== $value["val"][$n]) || isset($curLineOld[$key])){
				    if(isset($GLOBALS["STORED_REPS"][$id]["params"][REP_HREFS]) && !isset($GLOBALS["STORED_REPS"]["parents"][$value["val"][$n]]))
                        $blocks["_data_col"][$id][$names[$key]][$n] = "<a target=\"$key\" href=\"/$z/edit_obj/$i\">".$value["val"][$n]."</a>";
                    else
                        $blocks["_data_col"][$id][$names[$key]][$n] = $value["val"][$n];
                    Update_Val($i, Format_Val($GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_out"][$key]], $value["val"][$n]));
				}
			    else
			        trace(" value not changed: ".$dsRefs[$value["val"][$n]]);
    		}
		}
		unset($blocks["_update"]);
	}
# Format the Totals values according to their type
	if(isset($blocks["col_totals"][$id]))
		foreach($blocks["col_totals"][$id] as $key => $value)
			{
				$k = array_search($key, $GLOBALS["STORED_REPS"][$id]["names"]);
				if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL][$k]))
    				if(strtoupper($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL][$k]) == "AVG")
    					$value = $value / $GLOBALS["STORED_REPS"][$id]["rownum"];
    			if(isset($GLOBALS["STORED_REPS"][$id]["base_out"][$k]))
    				$blocks["col_totals"][$id][$key] = Format_Val_View($GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_out"][$k]], $value);
    			else
    			    $blocks["col_totals"][$id][$key] = $value;
    			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$k]))
    				if($GLOBALS["STORED_REPS"][$id][REP_COL_FUNC][$k] == "COUNT")
    					$blocks["col_totals"][$id][$key] = Format_Val_View($GLOBALS["BT"]["NUMBER"], $value);
			}
	if((isApi() || isset($args["json"])) && ($GLOBALS["GLOBAL_VARS"]["action"] == "report"))
	{
	    if(isset($_REQUEST["JSON_DATA"])){
    		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
        	    if(isset($field_names[$key])) # Only those values selected
        		    $json[$value] = count($blocks["_data_col"][$id]) ? array_shift($blocks["_data_col"][$id]) : "";
	    }
	    elseif(isset($_REQUEST["JSON_HR"])){
	        reset($blocks["_data_col"][$id]);
            $i = key($blocks["_data_col"][$id]);
	        var_dump($GLOBALS["STORED_REPS"]);
	        var_dump($GLOBALS["STORED_REPS"][$id]);
    		foreach($blocks["_data_col"][$id][$i] as $key => $value){
		        echo("\n$key ");
        		foreach($GLOBALS["STORED_REPS"][$id]["types"] as $k => $v){
        		    echo $blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["head"][$k]][$key]."($v)";
        		    if(isset($GLOBALS["STORED_REPS"]["parents"][$v]))
        		        echo(" req of ".$GLOBALS["STORED_REPS"]["parents"][(int)$v].", ");
        		    elseif(isset($GLOBALS["STORED_REPS"][$id]["PARENT"][$v])){
        		        echo(" arr of ".$GLOBALS["STORED_REPS"][$id]["PARENT"][$v].", ");
        		    }
        		    else{
        		        $json[$key][$GLOBALS["STORED_REPS"][$id]["head"][$k]]=$blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["head"][$k]][$key];
        		        echo(" is parent, ");
        		    }
        		}
    		}
	        var_dump($json);
	    }
	    elseif(isset($_REQUEST["JSON_CR"])){
    	    $i = 0;
    	    switch ($GLOBALS["STORED_REPS"][$id]["base_out"][$key]){
    	        case "NUMBER":
    	        case "SIGNED":
    	            $type = "number";
    	            break;
    	        default:
    	            $type = "string";
    	    }
    		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
        	    if(isset($field_names[$key])) # Only those values selected
        		{
        		    $json["columns"][$i]["id"] = $GLOBALS["STORED_REPS"][$id]["columns"][$key];
        		    $json["columns"][$i]["name"] = $value;
        		    $json["columns"][$i]["type"] = $type;
        		    $i++;
        		}
    	    $i = 0;
    	    if(count($blocks["_data_col"][$id]))
    	        reset($blocks["_data_col"][$id]);
                $i = key($blocks["_data_col"][$id]);
        		foreach($blocks["_data_col"][$id][$i] as $key => $value){
            		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $k => $v)
                	    if(isset($field_names[$k])) # Only those values selected
                		    $json["rows"][$key][$GLOBALS["STORED_REPS"][$id]["columns"][$k]] = $blocks["_data_col"][$id][$v][$key];
        		}
		    $json["totalCount"] = count($blocks["_data_col"][$id][$i]);
		    die(json_encode($json));
	    }
	    elseif(isset($_REQUEST["JSON_KV"])){
    	    $json = "[ ";
    	    if(count($blocks["_data_col"][$id]))
    	        reset($blocks["_data_col"][$id]);
                $i = key($blocks["_data_col"][$id]);
        		foreach($blocks["_data_col"][$id][$i] as $key => $value){
            		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $k => $v)
                	    if(isset($field_names[$k])) # Only those values selected
                		    $temp[$v] = $blocks["_data_col"][$id][$v][$key];
                	$json .= json_encode($temp, JSON_UNESCAPED_UNICODE).",";
        		}
    		api_dump(substr($json,0,-1)."]", $GLOBALS["STORED_REPS"][$id]["header"].".json");
	    }
	    else{
    	    $i = 0;
    		foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
        	    if(isset($field_names[$key])) # Only those values selected
        		{
        		    $origType = $GLOBALS["STORED_REPS"][$id]["types"][$key];
        			$GLOBALS["STORED_REPS"][$id]["last_res"][$value] = count($blocks["_data_col"][$id]) ? array_shift($blocks["_data_col"][$id]) : "";
        		    $json["columns"][$i]["id"] = $GLOBALS["STORED_REPS"][$id]["columns"][$key];
        		    $json["columns"][$i]["type"] = $origType;
        		    $json["columns"][$i]["format"] = $GLOBALS["STORED_REPS"][$id]["base_out"][$key];
        		    $json["columns"][$i]["name"] = $value;
        		    if($origType > 0){
            		    if(isset($GLOBALS["STORED_REPS"]["parents"][$origType])){
                		    if($isArr = isArray($id, $GLOBALS["STORED_REPS"]["parents"][$origType])){
                		        if(Check_Grant($isArr, $origType, "WRITE", FALSE))
                    		        $json["columns"][$i]["granted"] = 1;
                		    }
                		    elseif(Check_Grant($GLOBALS["STORED_REPS"]["parents"][$origType], $origType, "WRITE", FALSE))
                    		    $json["columns"][$i]["granted"] = 1;
            		    }
            		    elseif($isArr = isArray($id, $origType)){
        		            trace("Check_Grant($isArr, ".$GLOBALS["STORED_REPS"][$id]["arrays"][$isArr][$origType].")="
        		                .Check_Grant($isArr, $GLOBALS["STORED_REPS"][$id]["arrays"][$isArr][$origType], "WRITE", FALSE));
            		        if(Check_Grant($isArr, $GLOBALS["STORED_REPS"][$id]["arrays"][$isArr][$origType], "WRITE", FALSE))
                		        $json["columns"][$i]["granted"] = 1;
            		    }
            		    elseif(Check_Grant($origType, 0, "WRITE", FALSE))
                		    $json["columns"][$i]["granted"] = 1;
        		    }
        		    if(isset($GLOBALS["STORED_REPS"][$id]["ref_typ"][$origType]))
            		    $json["columns"][$i]["ref"] = 1;
        		    $i++;
        		}
    	    $i = 0;
        	foreach($GLOBALS["STORED_REPS"][$id]["last_res"] as $rs)
    		    $json["data"][$i++] = $rs;
    	    $i = 0;
        	if(isset($blocks["col_totals"][$id]))
        	    foreach($blocks["col_totals"][$id] as $v)
        		    $json["columns"][$i++]["totals"] = $v;
	    }
		api_dump(json_encode($json, JSON_UNESCAPED_UNICODE), $GLOBALS["STORED_REPS"][$id]["header"].".json");
	}
# Remember the last result
	$GLOBALS["STORED_REPS"][$id]["last_res"] = $blocks["_data_col"][$id];
	if(isset($blocks["col_totals"][$id]))
    	$GLOBALS["STORED_REPS"][$id]["last_totals"] = $blocks["col_totals"][$id];
}
function isArray($id, $i){
    foreach($GLOBALS["STORED_REPS"][$id]["arrays"] as $k => $arrs)
        foreach($arrs as $orig => $arr)
            if($orig == $i)
                return $k;
    return FALSE;
}
function build_post_fields($data){
    $dataArray = Array();
    $i = 0;
    $tmp = explode("&", $data);
    foreach($tmp as $value){
        $v = mb_substr($value, strpos($value, "=")+1);
        if(substr($v, 0, 1) === "@"){
            $v = substr($v, 1);
            $ftmp = explode("/", $v);
            $ftmp = array_pop($ftmp);
            if(strpos($v, "/".UPLOAD_DIR) === 0){
                $v = substr($v, 1);
                if(!file_exists($v))
                    die("File not found $v");
                $v = curl_file_create($v, '', $ftmp);
            }
            else{
                if(strtolower(substr($v, 0, 4)) !== "http")
                    die("Forbidden path $v, use http(s) or /".UPLOAD_DIR);
                $localTemp = "tmp_".($i++)."_".$GLOBALS["GLOBAL_VARS"]["user_id"];
                file_put_contents(UPLOAD_DIR.$localTemp, file_get_contents($v));
                $v = curl_file_create(UPLOAD_DIR.$localTemp, '', $ftmp);
            }
        }
        $dataArray[mb_substr($value, 0, strpos($value, "="))] = $v;
    }
    trace("dataArray ".print_r($dataArray, true));
    return $dataArray;
}
function getJsonVal($jsonKey, $val){
    $seek=TRUE;
    if((strlen($jsonKey) > 0) && (mb_strpos(strtoupper($val), strtoupper($jsonKey)) !== FALSE)){
        $tmp = json_decode($val);
        if(isset($tmp->$jsonKey))
            if(is_array($tmp->$jsonKey))
                return json_encode($tmp->$jsonKey, JSON_UNESCAPED_UNICODE);
        $tmp = json_decode($val, TRUE);
        trace(" getJsonVal ($jsonKey) ".print_r($tmp, TRUE));
        array_walk_recursive($tmp, function ($v, $k) use (&$val, &$jsonKey, &$seek){
            trace(" getJsonVal $k");
            if($seek && ($k === $jsonKey)){
                trace(" getJsonVal found $jsonKey");
                $seek = FALSE;
                return $val = $v;
            }
        });
    }
    return $val;
}
function checkJson($jsonKey, $val){
    $tmp = json_decode($val, TRUE);
    array_walk_recursive($tmp, function ($v, $k) use (&$val, &$jsonKey){
        if($k === $jsonKey)
            return $val = $v;
    });
    return $val;
}
function Slash_semi($str)
{
	return str_replace("\;", "\$L3sH", $str);
}
function UnSlash_semi($str)
{
	return str_replace("\$L3sH", ";", $str);
}
function Download_send_headers($filename)
{ 
# force download
	header("Content-Type: application/force-download");
	header("Content-Type: application/octet-stream");
	header("Content-Type: application/download");
# disposition / encoding on response body
	header("Content-Disposition: attachment;filename={$filename}");
	header("Content-Transfer-Encoding: binary");
    header("Content-Type: text/html; charset=UTF-8");
}
function FetchAlias($attr, $orig){
	preg_match(ALIAS_MASK, $attr, $alias); # Check if we got an alias
	return isset($alias[1]) ? $alias[1] : $orig;
}
function sendJsonHeaders($filename){
# force download
	header("Content-Type: application/json; charset=UTF-8");
# disposition / encoding on response body
	header("Content-Disposition: attachment;filename={$filename}");
	header("Content-Transfer-Encoding: binary");
}
function ResolveType($typ)
{
	global $z;
	$data_set = Exec_sql("SELECT id FROM $z WHERE val='".addslashes($typ[1])."' AND up=0 AND t=".$GLOBALS["BT"][$typ[2]], "Seek Typ");
	if($row = mysqli_fetch_array($data_set))
	{
	    $id = $row["id"];
	    constructHeader($id);
	}
	else # No analogue, register the new one
	{
	    $id = Insert(0, (isset($typ[3])?"1":"0"), $GLOBALS["BT"][$typ[2]], $typ[1], "Insert type substitute");
    	$GLOBALS["local_struct"][$id][0] = "$id:".MaskDelimiters($typ[1]).":".$GLOBALS["BT"][$typ[2]].(isset($typ[3])?":unique":"");
	}
	if($id != $typ[0])
	{
    	$GLOBALS["local_struct"]["subst"][$typ[0]] = $id;
    	trace("Substitute for ".$typ[0]." - ".$typ[1]." is $id");
	}
	return $id;
}
function CheckSubst($i)
{
    if(isset($GLOBALS["local_struct"]["subst"]))
        if(isset($GLOBALS["local_struct"]["subst"][$i]))
            return $GLOBALS["local_struct"]["subst"][$i];
    return $i;
}
function CheckObjSubst($i)
{
    if(isset($GLOBALS["obj_subst"]))
        if(isset($GLOBALS["obj_subst"][$i]))
            return $GLOBALS["obj_subst"][$i];
    return $i;
}
function maskCsvDelimiters($v){
    if(strpos($v,"\"") !== false)
        return "\"".str_replace("\"","\"\"",$v)."\"";
    elseif(strpos($v,";") !== false)
        return "\"".$v."\"";
    return $v;
}
function Get_block_data($block, $exe=TRUE, $noFilters=FALSE)
{
    $tmp = explode(".", $block);
	$block_name = array_pop($tmp);
	if(!strlen($block_name) || (substr($block_name, 0, 1) == "_")) # The "_" prefix means a local block, no report implied
		return;
	global $blocks, $id, $f_u, $a, $obj, $z, $com, $args;
	switch ($block_name)
	{
		case "&functions":
		    $data_set = Exec_sql("SELECT id, val FROM $z WHERE t=".REP_COL_FUNC." AND up=1 ORDER BY val", "Get functions");
			while($row = mysqli_fetch_array($data_set)){
                $blocks[$block]["id"][] = $row["id"];
                $blocks[$block]["val"][] = $row["val"];
			}
			break;
		case "&formats":
		    $data_set = Exec_sql("SELECT id, val FROM $z WHERE t=".REP_COL_FORMAT." AND up=1 ORDER BY val", "Get formats");
			while($row = mysqli_fetch_array($data_set)){
                $blocks[$block]["id"][] = $row["id"];
                $blocks[$block]["val"][] = $row["val"];
			}
			break;
		case "&top_menu":
			$blocks[$block]["top_menu"][] = t9n("[RU]Таблицы[EN]Tables");
			$blocks[$block]["top_menu_href"][] = "dict";
			if(in_array(Check_Types_Grant(FALSE), array("READ", "WRITE")))
			{
				$blocks[$block]["top_menu"][] = t9n("[RU]Структура[EN]Structure");
				$blocks[$block]["top_menu_href"][] = "edit_types";
			}
            if(RepoGrant() != "BARRED")
			{
				$blocks[$block]["top_menu"][] = t9n("[RU]Файлы[EN]Files");
				$blocks[$block]["top_menu_href"][] = "dir_admin";
			}
			#$blocks[$block]["top_menu"][] = t9n("[RU]Выход[EN]Exit");
			#$blocks[$block]["top_menu_href"][] = "exit";
			break;

		case "&main":
			$blocks[$block]["z"][] = $z;
			switch($GLOBALS["GLOBAL_VARS"]["action"]) # Show the current mode & object in the page header
			{
				case "object":
					if($id == 0)
						die(t9n("[RU]Ошибка: id=0 или не задан[EN]Object id is empty or 0"));
					$data_set = Exec_sql("SELECT obj.val, obj.t, par.id, obj.ord FROM $z obj
										LEFT JOIN ($z par CROSS JOIN $z req USE INDEX (up_t)) ON par.up=0 AND req.up=par.id AND req.t=obj.id
										WHERE obj.id=$id AND (obj.up=0 OR par.up=0)"
										, "Get Object type name");
					if($row = mysqli_fetch_array($data_set))
					{
						$blocks[$block]["title"][] = $row[0];
						$blocks[$block]["typ"][] = $row[1];
						$blocks[$block]["parent_obj"][] = $row[2];
						$blocks[$block]["unique"][] = $row["ord"];
					}
					else
					    die(t9n("[RU]Тип $id не найден[EN]Type $id not found"));
					break;
				case "edit_obj":
					if($id == 0)
						die(t9n("[RU]Ошибка: id=0 или не задан[EN]Object id is empty or 0"));
					$data_set = Exec_sql("SELECT typs.val, typs.t, a.val, typs.id
											FROM $z a, $z typs WHERE a.id=$id AND a.up!=0 AND typs.id=a.t AND typs.up=0"
										, "Get Object & type name");
					if($row = mysqli_fetch_array($data_set))
					{
						$blocks[$block]["title"][] = $row[0]." ".Format_Val_View($row[1], $row[2], $id);
						$GLOBALS["REV_BT"][$row["id"]] = $GLOBALS["REV_BT"][$row["t"]];
					}
        			else
        				die(t9n("[RU]Объект $id не найден, вероятно, он был удален[EN]Object $id not found (it might be deleted)"));
					break;
				case "csv_all":
				    set_time_limit(300);
					if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z))
						die("У вас нет прав на выгрузку базы");
        			$sql = "SELECT a.id, a.val, IF(base.t=base.id,0,1) ref, IF(base.t=base.id,defs.val,base.val) req, count(def_reqs.id) req_req, reqs.id req_id, defs.id req_t, defs.t req_base, a.t base
        			            FROM $z a LEFT JOIN $z reqs ON reqs.up=a.id LEFT JOIN $z defs ON defs.id=reqs.t LEFT JOIN $z def_reqs ON def_reqs.up=defs.id LEFT JOIN $z base ON base.id=defs.t 
                                WHERE a.up=0 AND a.id!=a.t AND a.val!='' AND a.t!=0
                                GROUP BY reqs.id ORDER BY a.id, reqs.ord";
        			$data_set = Exec_sql($sql, "Get Typs for backup");
            		if(!is_dir($path="templates/custom/$z/backups"))
            			mkdir($path);
            		$name = $z."_".date("Ymd_His").".csv";
                    $file = fopen("$path/$name", "a+");
					fwrite($file, pack('CCC', 0xef, 0xbb, 0xbf));
        			while($row = mysqli_fetch_array($data_set))  # All but buttons and calculatables
        				if(($GLOBALS["REV_BT"][$row["t"]] != "CALCULATABLE") && ($GLOBALS["REV_BT"][$row["t"]] != "BUTTON"))
        				{
        				    $i = $row["id"];
        					if(!isset($req[$i]) && !isset($typ[$i])){ # Not used as Req yet
        						$typ[$i] = maskCsvDelimiters($row["val"]);
        					    $select[$i] = $join[$i] = "";
        					    $reqs[$i] = Array();
        					    $base[$i] = $row["base"];
        					}
        					if($row["req"]){
        					    $reqs[$i][] = $rid = $row["req_id"];
        					    $base[$rid] = $r = $row["req_base"];
        						unset($typ[$row["req"]]); # Check if our Reqs are on the list of independents and remove them
        						$req[$row["req"]] = "";	# Remember the Req ID
        						$typ[$i] .= ";".maskCsvDelimiters($row["req"]);
        						if($row["req_req"] > 0)
        						    $arr[$row["req_t"]] = "";
                                else{
            						if($row["ref"] === "1")
                						$join[$i] .= " LEFT JOIN ($z l$rid CROSS JOIN $z r$rid USE INDEX (PRIMARY)) ON l$rid.up=obj.id AND r$rid.id=l$rid.t AND r$rid.t=$r";
                    				elseif(in_array($GLOBALS["REV_BT"][$r], array("CHARS", "MEMO", "FILE", "HTML"))){
                						$join[$i] .= " LEFT JOIN $z r$rid ON r$rid.up=obj.id AND r$rid.t=$rid LEFT JOIN $z t$rid ON t$rid.up=r$rid.id AND t$rid.t=0 AND t$rid.ord=0";
                						$select[$i] .= ", IF(t$rid.id IS NULL, 0, r$rid.id) t$rid";
                    				}
            						else
                						$join[$i] .= " LEFT JOIN $z r$rid ON r$rid.up=obj.id AND r$rid.t=$rid";
            						$select[$i] .= ", r$rid.val v$rid";
                                }
        					}
        				}
				    foreach($typ as $i => $v)
				    {
    					fwrite($file, $v);
                		$limit = round(500000/(count($reqs[$i])+1));
                		$last = 0;
                		do{
                    		$h = "";
                    		if(isset($arr[$i]))
                        		$data_set = Exec_sql("SELECT obj.id FROM $z obj, $z up WHERE obj.t=$i AND obj.up!=0 AND up.id=obj.up AND up.up!=0 AND obj.id>$last ORDER BY obj.id LIMIT $limit"
                        		                    , "Get arr objects for CSV");
                        	else
                        		$data_set = Exec_sql("SELECT id FROM $z obj WHERE t=$i AND up!=0 AND id>$last ORDER BY id LIMIT $limit", "Get objects for CSV");
                    		if($row = mysqli_fetch_array($data_set)){
        					    $first = $row["id"];
                    	        do{
                    	            $last = $row["id"];
                        		} while($row = mysqli_fetch_array($data_set));
                        		$data_set = Exec_sql("SELECT obj.id, obj.val".$select[$i]." FROM $z obj".$join[$i]." WHERE obj.t=$i AND obj.up!=0 AND obj.id>=$first AND obj.id<=$last"
                        		                    , "Get reqs for CSV");
                            	$rows_number = mysqli_num_rows($data_set);
                    	        $prev = 0;
                        		while($row = mysqli_fetch_array($data_set)){
                					if($prev !== $row["id"]){
                					    $v = $row["val"];
                					    $h .= "\n".maskCsvDelimiters(Format_Val_View($base[$i], $v));
                        		        $prev = $row["id"];
                					}
                					foreach($reqs[$i] as $rid){
            					        $v = $row["v$rid"];
                					    $h .= ";".maskCsvDelimiters(Format_Val_View($base[$rid], $v));
                					}
                        		}
            					fwrite($file, "$h");
                    		}
                		} while ($rows_number == $limit);
    					fwrite($file, "\n\n");
				    }
					fclose($file);
                    $zip = new ZipArchive();
                    $zip->open("$path/$name.zip", ZipArchive::CREATE);
                    $zip->addFile("$path/$name", $name);
                    $zip->close();
                    unlink("$path/$name");
                    header("Location: /$z/dir_admin/?templates=1&add_path=/backups&gf=$name.zip");
					die();
					break;
				case "restore":
				    set_time_limit(300);
				    $limit = 500000;
					if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z))
						die(t9n("[RU]У вас нет прав на импорт базы[EN]You do not have grants to import the database"));
            		if(!is_dir($path="templates/custom/$z/backups"))
            			die("No path $path");
    				if(!isset($_GET["backup_file"])||!is_file("$path/".$_GET["backup_file"]))
    					die(t9n("[RU]Загрузите файл для восстановления[EN]Please provide the backup file"));
            		$name = substr($_GET["backup_file"], 0, -4);
                    $zip = new ZipArchive;
                    if($zip->open("$path/".$_GET["backup_file"]) === TRUE){
                        $zip->extractTo("$path");
                        $zip->close();
                    }
                    else
                        echo 'failed';
                    $output = "";
                    $file = fopen("$path/$name",'r');
                    $last = 0;
                    while(!feof($file)){
                        $line = fgets($file);
                        if(strlen(trim($line)) === 0)
                            continue;
                    	if($last === 0 && substr($line, 0, 3) == pack('CCC', 0xef, 0xbb, 0xbf))
                            $line = substr($line, 3);
                        if(substr($line, 0, 1) === "/"){
                            $last++;
                            $line = substr($line, 1);
                        }
                        else{
                            if(substr($line, 0, 1) === ";"){
                                $last++;
                                $line = substr($line, 1);
                            }
                            else{
                                $delim = strpos($line, ";");
                                $last = $last + (int)base_convert(substr($line, 0, $delim), 36, 10);
                                $line = substr($line, $delim+1);
                            }
                            $delim = strpos($line, ";");
                            if($delim !== 0)
                                $lastup = (int)base_convert(substr($line, 0, $delim), 36, 10);
                            $line = substr($line, $delim+1);
                        }
                        $delim = strpos($line, ";");
                        if($delim !== 0)
                            $lastt = (int)base_convert(substr($line, 0, $delim), 36, 10);
                        $line = substr($line, $delim+1);
                        $delim = strpos($line, ";");
                        if($delim !== 0)
                            $ord = substr($line, 0, $delim);
                        else
                            $ord = 1;
                        $line = substr($line, $delim+1, -1);
                        $output .= "($last,$lastt,$lastup,$ord,'".addslashes($line)."'),";
                    }
                    $output = substr(str_replace("&ritrn;", "\n",str_replace("&ritrr;", "\r", $output)), 0, -1);
                    fclose($file);
                    die("INSERT INTO `$z` (`id`, `t`, `up`, `ord`, `val`) VALUES $output;");
					break;
				case "backup":
				    set_time_limit(300);
				    $limit = 500000;
					if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z))
						die(t9n("[RU]У вас нет прав на выгрузку базы[EN]You do not have grants to export the database"));
            		if(!is_dir($path="templates/custom/$z/backups"))
            			mkdir($path);
            		$name = $z."_".date("Ymd_His").".dmp";
                    $file = fopen("$path/$name", "a+");
					fwrite($file, pack('CCC', 0xef, 0xbb, 0xbf));
            		$last = 0;
            		$lastup = $lastt = "";
            		do{
                		$h = "";
    					$data_set = Exec_sql("SELECT id,up,t,ord,val FROM $z WHERE id>$last ORDER BY id LIMIT $limit", "Get Objects list for export");
                    	$rows_number = mysqli_num_rows($data_set);
                		while($row = mysqli_fetch_assoc($data_set)){
                		    if($last + 1 == $row["id"])
                		        $t = ";";
                		    else
                    	        $t = base_convert($row["id"] - $last, 10, 36).";";
            		        $last = $row["id"];
            		        if($lastup !== $row["up"])
                    		    $t .= base_convert($lastup = $row["up"], 10, 36).";";
                		    elseif($t === ";")
                	            $t = "/";
                		    else
                	            $t .= ";";
                		    if($lastt === $row["t"])
                	            $t .= ";";
                		    else
                    		    $t .= base_convert($lastt = $row["t"], 10, 36).";";
                		    if($row["ord"] !== "1")
                	            $t .= $row["ord"];
                		    $h .= "$t;".str_replace("\n", "&ritrn;",str_replace("\r", "&ritrr;", $row["val"]))."\n";
                		}
    					fwrite($file, $h);
            		} while ($rows_number == $limit);
					fclose($file);
                    $zip = new ZipArchive();
                    $zip->open("$path/$name.zip", ZipArchive::CREATE);
                    $zip->addFile("$path/$name", $name);
                    $zip->close();
                    unlink("$path/$name");
                    header("Location: /$z/dir_admin/?templates=1&add_path=/backups&gf=$name.zip");
					die();
					break;

				default:
					$blocks[$block]["title"][] = "Integram";
			}
#print_r($GLOBALS);die($a);
			break;

		case "&edit_typs":
#			Check_Types_Grant(FALSE);
			$data_set = Exec_sql("SELECT typs.id, typs.t, refs.id ref_val, typs.ord uniq
							, CASE WHEN refs.id!=refs.t THEN refs.val ELSE typs.val END val
							, reqs.id req_id, reqs.t req_t, reqs.ord, reqs.val attrs, ref_typs.t reft
						FROM $z typs LEFT JOIN $z refs ON refs.id=typs.t AND refs.id!=refs.t
							LEFT JOIN $z reqs ON reqs.up=typs.id
							LEFT JOIN $z req_typs ON req_typs.id=reqs.t AND req_typs.id!=req_typs.t
							LEFT JOIN $z ref_typs ON ref_typs.id=req_typs.t AND ref_typs.id!=ref_typs.t
						WHERE typs.up=0 AND typs.id!=typs.t
						ORDER BY ISNULL(reqs.id), CASE WHEN refs.id!=refs.t THEN refs.val ELSE typs.val END, refs.id DESC, reqs.ord"
					   , "Get Typs & Reqs");
//#[AS]07.01.2019				, CASE WHEN ref_typs.id!=ref_typs.t THEN ref_typs.val ELSE req_typs.val END req_val

			while($row = mysqli_fetch_array($data_set))
				foreach($row as $key => $value)
					$blocks[$block][$key][] = str_replace("\\","\\\\","$value");
			if(isApi())
			{
    			$GLOBALS["GLOBAL_VARS"]["api"]["edit_types"] = $blocks[$block];
                $GLOBALS["GLOBAL_VARS"]["api"]["types"] = $GLOBALS["basics"];			    
    			if(Check_Types_Grant() == "WRITE")
                    $GLOBALS["GLOBAL_VARS"]["api"]["editable"] = 1;			    
                die(json_encode($GLOBALS["GLOBAL_VARS"]["api"], JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE));
			}
			break;

		case "&editables":
			if(Check_Types_Grant() == "WRITE")
				$blocks[$block]["ok"][] = ""; # Display the New Type and New Link blocks
			break;
			
		case "&types":
			foreach($GLOBALS["basics"] as $key => $value)
			{
				$blocks[$block]["typ"][] = "$key";
				$blocks[$block]["val"][] = $value;
			}
			break;

		case "&object":
			if($id == 0)
				die(t9n("[RU]Ошибка: id=0 или не задан[EN]Object id is empty or 0"));
			$data_set = Exec_sql("SELECT a.id, a.val, a.up, a.t, typs.val typ_name, typs.t base_typ FROM $z a, $z typs WHERE a.id=$id AND typs.id=a.t AND typs.up=0"
								, "Get Object");
			if($row = mysqli_fetch_array($data_set)){
				$GLOBALS["parent_val"] = $row["val"];

				$blocks[$block]["id"][] = $GLOBALS["cur_id"] = $row["id"];
				$blocks[$block]["up"][] = $GLOBALS["parent_id"] = $row["up"];
				$blocks[$block]["typ"][] = $GLOBALS["parent_typ"] = $row["t"];
				$blocks[$block]["typ_name"][] = $row["typ_name"];
				$blocks[$block]["base_typ"][] = $GLOBALS["parent_base"] = $row["base_typ"];
				
				trace("Check_Grant for ".$row["id"]);
				if(Check_Grant($row["id"], 0, "WRITE", FALSE)) # Disable read-only values
					$parent_disabled = "";
				else if(Check_Val_granted($row["t"], $row["val"], $row["id"]) === "WRITE")
					$parent_disabled = "";
				else
				    $parent_disabled = "DISABLED";
				$blocks[$block]["disabled"][] = $GLOBALS["parent_disabled"] = $parent_disabled;
				trace("_Grant for ".$row["id"]." is ".$GLOBALS["parent_disabled"]);

				$v = $row["val"];
				if($GLOBALS["REV_BT"][$row["base_typ"]] != "SIGNED")
					$v = Format_Val_View($row["base_typ"], $v, $id);
				$blocks[$block]["val"][] = htmlspecialchars($v);
				
    			if(isApi()){
    				$GLOBALS["GLOBAL_VARS"]["api"]["obj"]["id"] = $row["id"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["obj"]["val"] = htmlspecialchars($v);
    				$GLOBALS["GLOBAL_VARS"]["api"]["obj"]["parent"] = $row["up"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["obj"]["typ"] = $row["t"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["obj"]["typ_name"] = $row["typ_name"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["obj"]["base_typ"] = $row["base_typ"];
    			}
    			
				GetObjectReqs($GLOBALS["parent_typ"], $id);
			}
			#  Check if we have some search criteria for Ref lists
			foreach($_REQUEST as $key => $value)
				if(substr($key, 0, 7) == "SEARCH_")
					if(strlen($value))	# Pass the criteria via GET - prepare the address string
						$GLOBALS["search"][substr($key, 7)] = $value;
#print_r($GLOBALS);die();
			break;

		case "&new_req":
		    $base = $GLOBALS["REV_BT"][$blocks["&main"]["CUR_VARS"]["typ"]];
			if(($base != "REPORT_COLUMN") && ($base != "GRANT"))
			{
				$blocks[$block]["new_req"][] = "";
				$blocks[$block]["type"][] = ($base == "DATE" ? "date" : "text");
			}
			break;

		case "&new_req_report_column":
			if($GLOBALS["REV_BT"][$blocks["&main"]["CUR_VARS"]["typ"]] == "REPORT_COLUMN")
				$blocks[$block]["new_req"][] = "";
			break;

		case "&new_req_grant":
			if($GLOBALS["REV_BT"][$blocks["&main"]["CUR_VARS"]["typ"]] == "GRANT")
				$blocks[$block]["new_req"][] = "";
			break;

		case "&grant_list":
			$existing = $req = array();  # Existing grants
			$parent_id = $GLOBALS["parent_id"];
			$parent_val = $GLOBALS["parent_val"];
#print_r($GLOBALS);die();
			$data_set = Exec_sql("SELECT gr.id, gr.val, reqs.id req_id, reqs.t req_t, req_typ.val req_val, ref_reqs.val ref_val
									FROM $z gr LEFT JOIN ($z reqs CROSS JOIN $z req_typ) ON gr.id!=1 AND reqs.up=gr.id AND req_typ.id=reqs.t
										LEFT JOIN $z ref_reqs ON ref_reqs.id!=ref_reqs.t AND ref_reqs.id=req_typ.t
									WHERE gr.up=0 AND gr.t!=gr.id AND gr.val!='' AND !COALESCE(gr.t=0 OR req_typ.t=0, false)
									ORDER BY gr.val, reqs.ord"
					, "Get available Grants");
			while($row = mysqli_fetch_array($data_set))
			{
				$i = $row["id"];
				if(!isset($existing[$i]) && !isset($req[$i])) # Add the parent Object to the list
				{
					$existing[$i] = "";
					
					$blocks[$block]["id"][$i] = $i;
					$blocks[$block]["val"][$i] = $row["val"];
					if($GLOBALS["parent_val"] == $i)
						$blocks[$block]["selected"][$i] = "SELECTED";
					else
						$blocks[$block]["selected"][$i] = "";
				}
				if(($row["req_id"] != 0) && !isset($existing[$row["req_id"]]))# Add the requisites
				{
					$req[$row["req_t"]] = "";
					if(isset($existing[$row["req_t"]]))	# Drop the record on this Req
						unset($blocks[$block]["id"][$row["req_t"]], $blocks[$block]["val"][$row["req_t"]], $blocks[$block]["selected"][$row["req_t"]]);
					$blocks[$block]["id"][$row["req_id"]] = $row["req_id"];
					$blocks[$block]["val"][$row["req_id"]] = $row["val"]." -> ".$row["req_val"].$row["ref_val"];
					if($GLOBALS["parent_val"] == $row["req_id"])
						$blocks[$block]["selected"][$row["req_id"]] = "SELECTED";
					else
						$blocks[$block]["selected"][$row["req_id"]] = "";
				}
			}
			foreach(array(0, 1, 10) as $key) # Add "All objects" & "Type Editor" grants on the list
				if(($GLOBALS["GLOBAL_VARS"]["action"] != "object") || !isset($existing[$key]))
				{
					$blocks[$block]["id"][] = $key;
					$blocks[$block]["val"][] = Format_Val_View($GLOBALS["BT"]["GRANT"], "$key");
					if((string)$GLOBALS["parent_val"] == "$key")
						$blocks[$block]["selected"][] = "SELECTED";
					else
						$blocks[$block]["selected"][] = "";
				}
#print_r($GLOBALS);die();
			break;

		case "&editreq_grant":
			if($GLOBALS["REV_BT"][$GLOBALS["parent_base"]] == "GRANT")
				$blocks[$block]["typ"][] = $GLOBALS["parent_typ"];
			break;

		case "&editreq_report_column":
			if($GLOBALS["REV_BT"][$GLOBALS["parent_base"]] == "REPORT_COLUMN")
				$blocks[$block]["typ"][] = $blocks[$block]["val"][] = $GLOBALS["parent_typ"];
			break;

		case "&edit_req":
		    $base = $GLOBALS["REV_BT"][$GLOBALS["parent_base"]];
			if(($base != "REPORT_COLUMN") && ($base != "GRANT"))
			{
				$blocks[$block]["typ"][] = $GLOBALS["parent_typ"];
				$blocks[$block]["type"][] = ($base == "DATE" ? "date" : "text");
			}
			break;

		case "&rep_col_list":
			$existing = $in_list = array();  # Existing columns with parent Objects, columns added to the list
			$parent_id = $GLOBALS["parent_id"];
			$parent_val = $GLOBALS["parent_val"];
			$req = Array();
			$data_set = Exec_sql("SELECT a.val col_id, CASE WHEN pars.id IS NULL THEN a.val ELSE pars.id END par_id
						FROM $z typs, $z a LEFT JOIN ($z reqs CROSS JOIN $z pars) ON pars.id=reqs.up AND reqs.id=a.val
						WHERE $parent_id!=0 AND a.up=$parent_id AND a.val!=0 AND a.t=typs.id AND typs.t=".$GLOBALS["BT"]["REPORT_COLUMN"]
						." ORDER BY a.ord"
					, "Get Existing Report Columns");
			if($row = mysqli_fetch_array($data_set)){
				do{
					$v = $row["par_id"];
					if(!isset($in))		# Prepare the column-separated list of Cols
						$in = ":$v:";
					elseif(strpos($in, ":$v:") === false)
						$in .= ",:$v:";
				} while($row = mysqli_fetch_array($data_set));

				if(strlen($in))
					$in = str_replace(":", "", $in);
				else
					$in = 0;
				$data_set = Exec_sql("SELECT refs.t, links.up FROM $z refs, $z links, $z typs
											WHERE refs.t IN ($in) AND typs.up=0 AND links.t=refs.id AND typs.id=links.up AND typs.val!=''
									UNION SELECT linx.up, refs.t FROM $z refs, $z linx 
											WHERE linx.up IN ($in) AND linx.t=refs.id
									UNION SELECT arr_refs.up, arrs.id FROM $z arrs, $z reqs, $z arr_refs
											WHERE arrs.val!='' AND arrs.up=0 AND reqs.up=arrs.id 
												AND arr_refs.t=arrs.id AND arr_refs.up IN ($in) AND reqs.ord=1
									UNION SELECT arrs.id, arr_refs.up FROM $z arrs, $z reqs, $z arr_refs USE INDEX (up_t), $z objs 
											WHERE arrs.up=0 AND reqs.up=arrs.id AND arr_refs.t=arrs.id AND objs.up=0
												AND objs.id=arr_refs.up AND arrs.id+0 IN ($in) AND reqs.ord=1"
											# "arrs.id+0 IN ($in)" prevents using range search sometimes
						, "Get all referenced Objects");
				$refs = "";
				while($row = mysqli_fetch_array($data_set)){
					if(!isset($GLOBALS["basics"][$row[0]]))
					    if(strpos($refs, ":".$row[0].":") === false)
						    $refs .= ",:".$row[0].":";
					if(!isset($GLOBALS["basics"][$row[1]]))
    					if(strpos($refs, ":".$row[1].":") === false)
    						$refs .= ",:".$row[1].":";
				}
				if(strlen($refs))
					$in = str_replace(":","",substr($refs, 1));  # Cut first comma and remove columns
#print_r($GLOBALS);die();
				$data_set = Exec_sql("SELECT pars.id par_id, reqs.id req_id, pars.val par_name, pars.t par_base
								, req_typs.id req_typ, CASE WHEN req_typs.val='' THEN ref_reqs.val ELSE req_typs.val END req_name
								, ref_reqs.id ref_typ, reqs.val ref_name, cols.val cols, arr.id arr
								, CASE WHEN req_typs.val='' THEN ref_reqs.t ELSE req_typs.t END base
							FROM $z pars LEFT JOIN $z reqs ON reqs.up=pars.id 
							    LEFT JOIN $z req_typs ON req_typs.id=reqs.t
								LEFT JOIN $z ref_reqs ON ref_reqs.id=req_typs.t AND ref_reqs.id!=ref_reqs.t
								LEFT JOIN $z arr ON ref_reqs.id IS NULL AND arr.up=req_typs.id AND arr.ord=1
								LEFT JOIN (SELECT val FROM $z WHERE up=$parent_id AND val!='$parent_val' LIMIT 1) cols ON cols.val=reqs.id
							WHERE pars.id IN ($in) AND pars.id!=pars.t ORDER BY pars.val, reqs.ord"
						, "Get Available Report Columns");
			}
			else{
     			if(isApi()){ # Prepare the list of dependent terms
        			$data_set = Exec_sql("SELECT a.id, a.val, a.t, reqs.t reqs_t FROM $z a LEFT JOIN $z reqs ON reqs.up=a.id
        						            WHERE a.up=0 AND a.id!=a.t AND a.val!='' AND a.t!=0 ORDER BY a.val"
        						    , "Get all independent singles");
        			while($row = mysqli_fetch_array($data_set))  # All but buttons and calculatables
        				if(($GLOBALS["REV_BT"][$row["t"]] != "CALCULATABLE") && ($GLOBALS["REV_BT"][$row["t"]] != "BUTTON"))
        					if($row["reqs_t"])	# Check if our Reqs are on list of independents and remove them
        						$req[$row["reqs_t"]] = "";	# Remember the Req ID
     			}
				$data_set = Exec_sql("SELECT pars.id par_id, reqs.id req_id, pars.val par_name, reqs.val ref_name, NULL cols
				                , req_typs.id req_typ, ref_reqs.id ref_typ
								, CASE WHEN req_typs.val='' THEN ref_reqs.val ELSE req_typs.val END req_name, arr.id arr
								, CASE WHEN req_typs.val='' THEN ref_reqs.t ELSE req_typs.t END base
							FROM $z pars
							    LEFT JOIN $z reqs ON reqs.up=pars.id
								LEFT JOIN $z req_typs ON req_typs.id=reqs.t
								LEFT JOIN $z ref_reqs ON ref_reqs.id=req_typs.t AND ref_reqs.id!=ref_reqs.t
								LEFT JOIN $z arr ON ref_reqs.id IS NULL AND arr.up=req_typs.id AND arr.ord=1
							WHERE pars.up=0 AND pars.val!='' AND pars.t!=pars.id ORDER BY pars.val, reqs.ord"
							, "Get All Report Columns");
			}
            $i = 0;
			while($row = mysqli_fetch_array($data_set)){
				$pid = $row["par_id"];
			    if(isset($req[$pid]))
			        continue;
				# Do not allow to create reports including the object forbidden in the role
			    if(isset($blocks["&main..&uni_obj.&new_req_report_column"]) && !Grant_1level($pid))
			        continue;
				if(!isset($in_list[$pid])  # Add a separate record for the Object's Value
					|| (!isset($parent_listed) && ($pid == $GLOBALS["parent_val"])))
				{
					if((!isset($parent_listed) && ($pid == $GLOBALS["parent_val"])))
						$parent_listed = TRUE;
					
					$in_list[$pid] = ""; # Mark it listed
					$blocks[$block]["id"][] = $pid;
					$blocks[$block]["val"][] = $row["par_name"];
					if($GLOBALS["parent_val"] == $pid)
						$blocks[$block]["selected"][] = "SELECTED";
					else
						$blocks[$block]["selected"][] = "";
						
        			if(isApi()){ //  && $row["base"]
            		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["id"] = $pid;
            		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["name"] = $row["par_name"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["type"] = $pid;
            		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["table"] = $pid;
            		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["base"] = $GLOBALS["REV_BT"][$row["par_base"]];
            		    $i++;
        			}
				}
#print_r($blocks);die();
				if(strlen($row["arr"]) || !isset($row["req_id"])) # Skip Array reqs or objects without reqs
					continue;
				if(!Check_Grant($pid, $row["req_id"], "READ", FALSE))
					continue;
				$alias = $row["par_name"]." -> ".$row["req_name"];
				# Correct the column name in case there is an alias
				if(isset($row["ref_typ"]) && strlen($row["ref_name"])){
					$tmp = FetchAlias($row["ref_name"], $row["req_name"]);
					if($tmp != $row["req_name"])
						$alias = $row["par_name"]." -> $tmp (".$row["req_name"].")";
				}
				$blocks[$block]["val"][] = $alias;
				$blocks[$block]["id"][] = $row["req_id"];
				if($GLOBALS["parent_val"] == $row["req_id"])
					$blocks[$block]["selected"][] = "SELECTED";
				else
					$blocks[$block]["selected"][] = "";
				if(isset($existing[$pid]) && isset($existing[$row["ref_typ"]]))
					if(isset($existing[$pid."_".$row["ref_typ"]])){
						if($existing[$pid."_".$row["ref_typ"]] == 0)
							$GLOBALS["warning"] .= t9n("[RU]Тип <b>".$row["req_name"]."</b> используется более 1 раза как реквизит типа "
							            ."[EN]Type <b>".$row["req_name"]."</b> is used more than once as attribute of type ")
							            ."<b>".$row["par_name"]."</b><br/>";
						$existing[$pid."_".$row["ref_typ"]]++;
					}
					else
						$existing[$pid."_".$row["ref_typ"]] = 0;
    			if(isApi() && $row["base"]){
        		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["id"] = $row["req_id"];
        		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["name"] = $alias;
        		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["type"] = $row["req_typ"];
        		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["base"] = $GLOBALS["REV_BT"][$row["base"]];
        		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["table"] = $pid;
    				if(isset($row["ref_typ"]) && strlen($row["ref_name"]))
            		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["ref"] = $row["ref_typ"];
    			}
    		    $i++;
 			}
			# Add Calculated field, which is to be calculated by an expression, constructed from aliases
			$blocks[$block]["id"][] = "0";
			$blocks[$block]["val"][] = CUSTOM_REP_COL;
			if($GLOBALS["parent_val"] == "0")
				$blocks[$block]["selected"][] = "SELECTED";
			else
				$blocks[$block]["selected"][] = "";
			if(isApi()){
    		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["id"] = "0";
    		    $GLOBALS["GLOBAL_VARS"]["api"]["rep_col_list"][$i]["name"] = CUSTOM_REP_COL;
			}
#print_r($GLOBALS);print_r($existing);die();
			break;

		case "&warnings":
			if(isset($GLOBALS["warning"]))
				$blocks[$block]["warning"][] = $GLOBALS["warning"];
			break;

		case "&tabs":
			if(!isset($GLOBALS["TABS"]))
				break; #	$GLOBALS["TABS"][0] = "Реквизиты";
			$tab = isset($_REQUEST["tab"]) ? $_REQUEST["tab"] : 0;
			foreach($GLOBALS["TABS"] as $key => $value)
			{
				$blocks[$block]["tab"][] = "$key";
				$blocks[$block]["val"][] = "$value";
				if($tab == $key || ($tab == 0 && !count($blocks[$block]["class"])))
				{
					$has_active = true;
					$blocks[$block]["class"][] = "class=\"tab-link active\"";
				}
				else
					$blocks[$block]["class"][] = "class=\"tab-link\"";
			}
			$blocks[$block]["tab"][] = "1";	# Show all Reqs in one tab
			$blocks[$block]["val"][] = t9n("[RU]Все[EN]All");
			$blocks[$block]["class"][] = $has_active ? "class=\"tab-link\"" : "class=\"tab-link active\"";
			break;

		case "&object_reqs":
			$rows = isset($GLOBALS["ObjectReqs"]) ? $GLOBALS["ObjectReqs"] : array();
			foreach($GLOBALS["REQS"] as $key => $value){
				if(isset($rows[$key]))
					$row = $rows[$key];
				elseif(isset($GLOBALS["REF_typs"][$key]))
					$row = $rows[$GLOBALS["REF_typs"][$key]];
				elseif(isset($GLOBALS["ARR_typs"][$key]))
					$row = array("arr_num" => isset($rows[$GLOBALS["ARR_typs"][$key]]["arr_num"]) ? (int)$rows[$GLOBALS["ARR_typs"][$key]]["arr_num"] : NULL);
				else
					$row = array();
				$row["attrs"] = $GLOBALS["REQS"][$key]["attrs"];
				$attrs = strlen($row["attrs"]) ? removeMasks($row["attrs"]) : "";
#print_r($GLOBALS);print_r($rows);die();
				$base_typ = $GLOBALS["REQS"][$key]["base_typ"];
				$GLOBALS["REV_BT"][$key] = $GLOBALS["REV_BT"][$base_typ];
				if(isset($GLOBALS["GRANTS"][$key])) # Skip barred Reqs - hide them
					if($GLOBALS["GRANTS"][$key] == "BARRED")
						continue;
				if($GLOBALS["REV_BT"][$base_typ] == "BUTTON"){ # Remember Buttons to show them later as buttons
					$blocks["BUTTONS"][$GLOBALS["REQS"][$key]["val"]] = $GLOBALS["REQS"][$key]["attrs"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["type"] = $GLOBALS["REQS"][$key]["val"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["order"] = $GLOBALS["REQS"][$key]["ord"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["value"] = $v;
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["base"] = $GLOBALS["REV_BT"][$base_typ];
					continue;
				}
				$v = isset($row["val"]) ? $row["val"] : "";
				if((isset($row["id"]) ? $row["id"] : 0) > 0){
    				$blocks[$block]["is_empty"][] = "";
					if(($GLOBALS["REV_BT"][$base_typ] != "SIGNED") && !isset($GLOBALS["REF_typs"][$key]))
						$v = Format_Val_View($base_typ, $v, $row["id"]);
				}
				else{  # No requisite yet - add the default value, if any
    				$blocks[$block]["is_empty"][] = "1";
					if(strlen($attrs)){  # We got either NOT_NULL or default value
						$v = BuiltIn($attrs); # Calc predefined value
						if($v == $attrs) # BuiltIn gave nothing - try calculatables
						{  
							$id_bak = $id;
							$block_bak = $block;
							Get_block_data($attrs);
							$id = $id_bak;   # Restore ID and Block info
							$block = $block_bak;
							$i = 0;
    						if(isset($blocks[$attrs])) # report
    							foreach($blocks[$attrs] as $tmp){ # Get 1st column
        							if(count($tmp) === 1){ # Number of recs in 1st column
            							if(isset($blocks[$attrs][mb_strtolower($attrs)])) # Is there a col named as the rep?
        									$v = $blocks[$attrs][mb_strtolower($attrs)][0];
        								else
        								    $v = $tmp[0];
        								trace(" let $v");
        							}
        							else
            						    $v = "";
        							break;
    							}
						}
					}
				}
				if($GLOBALS["REV_BT"][$base_typ] != "FILE") # File contains hyperlink tags
					$blocks[$block]["val"][] = htmlspecialchars($v);
				else
					$blocks[$block]["val"][] = $v;
    			if(isApi()){
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["type"] = $GLOBALS["REQS"][$key]["val"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["order"] = $GLOBALS["REQS"][$key]["ord"];
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["value"] = $v;
    				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["base"] = $GLOBALS["REV_BT"][$base_typ];
    				if(isset($GLOBALS["REF_typs"][$key])){
        				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["ref_type"] = $GLOBALS["REF_typs"][$key];
        				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["ref"] = $row["ref_val"];
    				}
    				elseif(isset($row["arr_num"])){
        				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["arr"] = $row["arr_num"];
        				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["arr_type"] = $GLOBALS["ARR_typs"][$key];
    				}
    				if(strlen($row["attrs"]))
        				$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["attrs"] = $row["attrs"];
    				if(isset($row["multiselect"]["id"]))
						if((count($row["multiselect"]["id"]) > 1) || isset($GLOBALS["MULTI"][$key]))
							$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$key]["multiselect"] = $row["multiselect"];
    			}
				$blocks[$block]["reqid"][] = isset($row["id"]) ? $row["id"] : "";
				$blocks[$block]["typ"][] = $key;
				$blocks[$block]["restrict"][] = $GLOBALS["REQS"][$key]["restrict"];
				$blocks[$block]["up"][] = $id;
				$blocks[$block]["typ_name"][] = $GLOBALS["REQS"][$key]["val"];
				$blocks[$block]["not_null"][] = strpos($row["attrs"], NOT_NULL_MASK) === false ? 0 : 1;
				$blocks[$block]["multi"][] = strpos($row["attrs"], MULTI_MASK) === false ? 0 : 1;
				$blocks[$block]["arr_num"][] = isset($row["arr_num"]) ? $row["arr_num"] : 0;
				$blocks[$block]["arr"][] = isset($GLOBALS["ARR_typs"][$key]) ? $GLOBALS["ARR_typs"][$key] : 0;
				$blocks[$block]["attrs"][] = $row["attrs"];
				if(isset($GLOBALS["ARR_typs"][$key]))
					$GLOBALS["REV_BT"][$key] = "ARRAY";
			    trace("Check GRANTS for $key");
				if(Val_barred_by_mask($key, isset($row["val"]) ? $v : NULL))
						$blocks[$block]["disabled"][] = "DISABLED";
				elseif(isset($GLOBALS["GRANTS"][$key]))
				{
				    trace("GRANTS for $key: ".$GLOBALS["GRANTS"][$key]);
					if($GLOBALS["GRANTS"][$key] == "WRITE")
						$blocks[$block]["disabled"][] = $GLOBALS["enable_save"] = ""; # Activate the Save button
					else
						$blocks[$block]["disabled"][] = "DISABLED";
				}
				else
					$blocks[$block]["disabled"][] = $GLOBALS["parent_disabled"];
				# In case we have some reqs granted for edit, enable the Save button
				if(isset($GLOBALS["enable_save"]))
				{
    				$blocks[$block]["enable_save"][] = "<script>enable_save=1;</script>";
					unset($GLOBALS["enable_save"]);
				}
				else
    				$blocks[$block]["enable_save"][] = "";
#{print_r($GLOBALS);print_r($rows);print_r($row);die("!".$v);}

				if(isset($GLOBALS["REF_typs"][$key])){
					if(strlen($v))
						Check_Val_granted($key, $row["ref_val"], $v); # Check if we got this Req val granted
					$GLOBALS["REV_BT"][$key] = "REFERENCE";
					$blocks[$block]["ref"][] = $GLOBALS["REF_typs"][$key];
					$blocks[$block]["base_typ"][] = $base_typ;
				}
				else
				{
					if(strlen($v))
						Check_Val_granted($key, $v); # Check if we got this Req val granted
					$blocks[$block]["ref"][] = "";
					$blocks[$block]["base_typ"][] = $base_typ;
				}
			}
#{print_r($GLOBALS);print_r($rows);print_r($blocks[$block]);die("".$GLOBALS["REF_typs"][$key]);}
			break;

		case "&editreq_array":
			if($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["arr"] != 0){
				$blocks[$block]["typ"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["arr"];
				$blocks[$block]["val"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"];
			}
			break;

		case "&editreq_pwd":
			if($GLOBALS["REV_BT"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]] == "PWD"){
				$blocks[$block]["disabled"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["disabled"];
				$blocks[$block]["typ"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
				$blocks[$block]["val"][] = strlen($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]) ? PASSWORDSTARS : "";
				$blocks[$block]["disabled"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["disabled"];
				$blocks[$block]["is_empty"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["is_empty"];
			}
			break;

		case "&editreq_boolean":
			# Logical Reqs are sent with "CHECKED" attribute
			if($GLOBALS["REV_BT"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]] == strtoupper(substr($block_name, 9)))
				if($GLOBALS["REV_BT"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"]] == "BOOLEAN")
					$blocks[$block]["checked"][] = ($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]!="" ? "CHECKED" : "");
		case "&editreq_file":
			$blocks[$block]["reqid"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["reqid"];
		case "&editreq_reference":
		case "&editreq_short":
		case "&editreq_chars":
		case "&editreq_html":
		case "&editreq_memo":
		case "&editreq_date":
		case "&editreq_datetime":
		case "&editreq_signed":
		case "&editreq_number":
		case "&editreq_calculatable":
#print_r($GLOBALS);die();
			if($GLOBALS["REV_BT"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]] == strtoupper(substr($block_name, 9)))
			{
				$blocks[$block]["typ"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
				$blocks[$block]["ref"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["ref"];
				$blocks[$block]["base_typ"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"];
				$blocks[$block]["disabled"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["disabled"];
    			$blocks[$block]["restrict"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["restrict"];
				$blocks[$block]["is_empty"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["is_empty"];
				if(($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] == "") # The current value is empty
					# and we got the value predefined from $_REQUEST
					&& isset($_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]]))
					$blocks[$block]["val"][] = $_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]];
				else
					$blocks[$block]["val"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"];
			}
			break;
			
		case "&multiselect":
		    $ref_typ = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
		    if(isset($GLOBALS["MULTI"][$ref_typ]) || empty($GLOBALS["ObjectReqs"][$ref_typ]["multiselect"]["id"]))
		        foreach($GLOBALS["ObjectReqs"][$ref_typ]["multiselect"]["id"] as $i => $val){
        		    $blocks[$block]["id"][] = $GLOBALS["ObjectReqs"][$ref_typ]["multiselect"]["id"][$i];
        		    $blocks[$block]["val"][] = $GLOBALS["ObjectReqs"][$ref_typ]["multiselect"]["val"][$i];
        		    $blocks[$block]["ord"][] = $GLOBALS["ObjectReqs"][$ref_typ]["multiselect"]["ord"][$i];
        		    $blocks[$block]["name"][] = $GLOBALS["ObjectReqs"][$ref_typ]["multiselect"]["ref_val"][$i];
		        }
			break;
			
		case "&array_val": # This might contain some value, in case this Req once had no reqs of his own
		    if(isset($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["arr"]))
    			if(($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["arr"] != 0) && strlen($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]))
    				$blocks[$block]["val"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"];
			break;

		case "&nullable_req":
		case "&nullable_req_close":
			if($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["not_null"] != 0)   # The Req marked as Not-NULL
				if(($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] == "")    # ... and actually is either NULL
					&& ($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["arr_num"] == 0))   # ... or is an empty array
					$blocks[$block]["not_null"][] = "*";
			break;

		case "&ref_create_granted":
			if(Grant_1level(($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["ref"])) == "WRITE")
				$blocks[$block]["typ"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
			$blocks[$block]["orig"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["ref"];
			break;

		case "&add_obj_ref_reqs":
			$cur_ref_req = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["ref"];  # Get the current link's type
			$cur_ref_typ = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
			$row["attrs"] = $GLOBALS["REQS"][$cur_ref_typ]["attrs"];
			$attrs = strlen($row["attrs"]) ? removeMasks($row["attrs"]) : "";
			if(strlen($attrs)){
			    if(!isset($blocks[$attrs])){
    				$id_bak = $id;
    				$block_bak = $block;
    				Get_block_data($attrs);
    				if($blocks[$attrs] > 0){
        			    $ids = array_shift($blocks[$attrs]);
        			    $vals = array_shift($blocks[$attrs]);
        			    $alts = array_shift($blocks[$attrs]);
        			    if((count($ids) > 0 )&& (count($ids) === count($vals))){
            			    foreach($ids as $k => $v){
                				$blocks[$block]["r"][] = $cur_ref_typ;
                				$blocks[$block]["id"][] = $v;
                				$blocks[$block]["val"][] = strlen($vals[$k])>0 ? $vals[$k] : (isset($alts)&&strlen($alts[$k])>0 ? $alts[$k] : $v);
                				if(isset($GLOBALS["MULTI"][$cur_ref_typ]) || (!empty($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["id"])
                																&& count($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["id"]) > 1))
                					$blocks[$block]["selected"][] = "";
                				elseif($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] == $v)
                					$blocks[$block]["selected"][] = " SELECTED";
                				else
                					$blocks[$block]["selected"][] = "";
            			    }
            			    return;
        			    }
    				}
    				$id = $id_bak;   # Restore ID and Block info
    				$block = $block_bak;
			    }
			}
			$search_val = "";
			if(isset($GLOBALS["search"][$cur_ref_typ])) # Check if we got some filter for the list
				$search_arr = explode("/", addslashes($GLOBALS["search"][$cur_ref_typ]));
			$data_set = Exec_sql("SELECT def_reqs.id, ref_reqs.id ref_req, base.t base, is_ref.val ref_name
											, CASE WHEN length(base.val)!=0 THEN 0 ELSE base.t END is_ref
									FROM $z r JOIN $z def_reqs ON def_reqs.up=r.t
									JOIN $z base ON base.id=def_reqs.t JOIN $z is_ref ON base.t=is_ref.id
									LEFT JOIN $z ref_reqs ON ref_reqs.up=r.id AND ref_reqs.t=def_reqs.t
								WHERE r.t=$cur_ref_req and r.up=0 ORDER BY ref_reqs.ord", "Get ref's reqs");
			# Fetch extra fields for the value of the Ref list
			$joins = $reqs = $reqs_granted = $sub_reqs = $join_granted = $search_req = "";
			$req_count = 0;
			if(isset($search_arr[0]))
				if(strlen($search_arr[0]))
				{
					$GLOBALS["where"] = "";
					Construct_WHERE($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"], array("F" => $search_arr[$req_count])
									, $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"], FALSE);
					$search_req = str_replace("a".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"].".val", "vals.val", $GLOBALS["where"]);
#print_r($GLOBALS);die($search_req);
				}
			while($row = mysqli_fetch_array($data_set))
			{
				$req = $row["id"];
				if(isset($row["ref_req"]))
				{
					$req_count++;
					if($row["is_ref"])	# Join requisites' tables
						$joins .= " LEFT JOIN ($z r$req CROSS JOIN $z a$req) ON r$req.up=vals.id AND a$req.id=r$req.t AND a$req.t=".$row["is_ref"];
					else
						$joins .= " LEFT JOIN $z a$req ON a$req.up=vals.id AND a$req.t=$req";
					$reqs .= ", $req"."val";	# Fetch Requisites' values
					$sub_reqs .= ", a$req.val $req"."val";
					if(isset($search_arr[$req_count]))	# Apply Req's filters, if any
						if(strlen($search_arr[$req_count]))
						{
							$GLOBALS["REV_BT"][$req] = $GLOBALS["REV_BT"][$row["base"]];
							$GLOBALS["where"] = "";
							Construct_WHERE($req, array("F" => $search_arr[$req_count]), 1, FALSE);
							$search_req .= $GLOBALS["where"];
						}
				}
				# Fetch grants to the reqs of the Referenced Object
				if(isset($GLOBALS["GRANTS"]["mask"][$req]))
				{
					unset($granted);
					foreach($GLOBALS["GRANTS"]["mask"][$req] as $mask => $level) # Apply all masks
					{
						$GLOBALS["where"] = $GLOBALS["join"] = "";
						if($GLOBALS["REV_BT"][$row["base"]])
							$GLOBALS["REV_BT"][$req] = $GLOBALS["REV_BT"][$row["base"]];
						else
						{
							$GLOBALS["REV_BT"][$req] = "REFERENCE";
							$GLOBALS["REF_typs"][$req] = $row["base"];
						}
						$GLOBALS["where"] = "";
#die("$req $cur_ref_typ ".$row["ref_req"]);
						Construct_WHERE($req, array("F" => $mask), $cur_ref_req, $req);
						if(isset($granted))
							$granted .= " OR ".substr($GLOBALS["where"], 4);
						else
							$granted = substr($GLOBALS["where"], 4);
						if(strpos($join_granted.$joins, "$z a$req") === FALSE) # Is the table joined already?
							$join_granted .= $GLOBALS["join"];
					}
					$reqs_granted .= " AND ($granted) ";
				}
			}
			# Fetch grants to the Referenced Object itself
			if(isset($GLOBALS["GRANTS"]["mask"][$cur_ref_req]))
			{
				unset($granted);
				foreach($GLOBALS["GRANTS"]["mask"][$cur_ref_req] as $mask => $level) # Apply all masks
				{
					$GLOBALS["where"] = "";
					Construct_WHERE($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"], array("F" => $mask), 1, FALSE);
					if(isset($granted))
						$granted .= " OR ".substr($GLOBALS["where"], 4);
					else
						$granted = substr($GLOBALS["where"], 4);
				}
				$reqs_granted .= str_replace("a".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"].".val", "vals.val", " AND ($granted) ");
			}
			if($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] != 0)
				$cur_val = " UNION (SELECT vals.id, vals.val $sub_reqs FROM $z vals $joins WHERE vals.id='".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]."') ";
			elseif(isset($_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]]))
				$cur_val = " UNION (SELECT vals.id, vals.val $sub_reqs FROM $z vals $joins WHERE vals.id='".addslashes($_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]])."') ";
			else
				$cur_val = "";

			$sql = "SELECT vals.id, vals.val ref_val $reqs 
						FROM (SELECT vals.id, vals.val $sub_reqs FROM $z vals  $join_granted $joins, $z pars
						WHERE pars.id=vals.up AND pars.up!=0 AND vals.t=$cur_ref_req $search_val $reqs_granted $search_req LIMIT ".DDLIST_ITEMS.") vals
					$cur_val ORDER BY ref_val";
			$data_set = Exec_sql($sql, "Get Object ref reqs"); # Add_Obj_Ref_Reqs
			$blocks["ref_count"] = mysqli_num_rows($data_set); # Expand the list in case there are more
			while($row = mysqli_fetch_array($data_set))
			{
			    if((isset($GLOBALS["MULTI"][$cur_ref_typ])
							|| (!empty($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["id"])
									&& count($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["id"]) > 1))
			            && isset($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"])
						&& (!empty($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["val"])
							&& array_search($row["id"], $GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["val"])))
			        continue;
				$i = 1; 
				$reqs = "";
				while($i <= $req_count)  # Append more identifying info to the dropdown list values
				{
					$i++;
					if(strlen($row[$i]))
						$reqs .= " / ".$row[$i];
					else
						$reqs .= " / --";
				}
				$blocks[$block]["r"][] = $cur_ref_typ;
				$blocks[$block]["id"][] = $row["id"];
				$blocks[$block]["val"][] = Format_Val_View($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"]
															, htmlspecialchars($row["ref_val"])).$reqs;
				if(($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] == 0) # The current value is empty
					# and we got the list value predefined from $_REQUEST
				  && isset($_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]]))
				{
					if($_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]] == $row["id"])
						$blocks[$block]["selected"][] = " SELECTED";
					else
						$blocks[$block]["selected"][] = "";
				}
#				trace(" SELECTED? ".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] ."==". $row["id"]);
				if(isset($GLOBALS["MULTI"][$cur_ref_typ]) || (!empty($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["id"])
																&& count($GLOBALS["ObjectReqs"][$cur_ref_typ]["multiselect"]["id"]) > 1))
					$blocks[$block]["selected"][] = "";
				elseif($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] == $row["id"])
					$blocks[$block]["selected"][] = " SELECTED";
				elseif(($blocks["ref_count"] == 1) 
						&& (isset($_REQUEST["t".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]])
								|| isset($_REQUEST["SEARCH_".$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]])))
					$blocks[$block]["selected"][] = " SELECTED";
				else
					$blocks[$block]["selected"][] = "";
			}
			break;
			
		case "&seek_refs":
			if($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["disabled"] == "")
				if(($blocks["ref_count"] >= DDLIST_ITEMS)  # We got more items, than DDLIST_ITEMS
					|| isset($GLOBALS["search"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]])){ # or got the search criteria
					# Fill in the received search criteria, if any
					$blocks[$block]["search"][] = "".$GLOBALS["search"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"]];
					$blocks[$block]["more"][] = "1";
				}
			break;
		
		case "&uni_obj_list":
		    if(isset($_GET["val"]))
		        $cond = " AND a.val LIKE '".addslashes($_GET["val"])."'";
		    else
		        $cond = "";
			$sql = "SELECT a.id, a.val, a.t, reqs.t reqs_t, reqs.up FROM $z a LEFT JOIN $z reqs ON reqs.up=a.id
						WHERE a.up=0 AND a.id!=a.t AND a.val!='' AND a.t!=0 $cond ORDER BY a.val";
			$data_set = Exec_sql($sql, "Get all independent Typs");
			while($row = mysqli_fetch_array($data_set))  # All but buttons and calculatables
				if(($GLOBALS["REV_BT"][$row["t"]] != "CALCULATABLE") && ($GLOBALS["REV_BT"][$row["t"]] != "BUTTON"))
				{
				    $base[$row["id"]] = $row["t"];
					if(!isset($req[$row["id"]]))  # Not used as Req yet
						$typ[$row["id"]] = $row["val"];
					if($row["reqs_t"] # Check if our Reqs are on list of independents and remove them
					            && ($row["reqs_t"] !== $row["up"])){	# and is not a Req of itself
						unset($typ[$row["reqs_t"]]);
						$req[$row["reqs_t"]] = "";	# Remember the Req ID
					}
				}
			if(count($typ))
				foreach($typ as $id => $val)
					if(Grant_1level($id))
					{
						$blocks[$block]["id"][] = $id;
						$blocks[$block]["val"][] = htmlspecialchars($val);
						$blocks[$block]["type"][] = $base[$id];
					}
			if(isApi()){
			    $json = Array();
			    foreach($blocks[$block]["id"] as $key => $value)
			        $json[$value] = $blocks[$block]["val"][$key];
            	api_dump(json_encode($json, JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE));
			}
			break;

		case "&uni_obj":
#print_r($GLOBALS);die();
		    if(isset($_REQUEST["_m_del_select"]) && $_SERVER["REQUEST_METHOD"] !== "POST")
				die(t9n("[RU]Для удаления записей используйте метод POST[EN]Please use a POST request to delete records"));
		    if(isset($_POST["bki"]) || isset($_GET["bki"]))
				$GLOBALS["dataExport"] = Array();
			if($f_u > 1){
				if(isset($_REQUEST["_m_del_select"])){ # The user tries to drop the selection
        		    if($_SERVER["REQUEST_METHOD"] !== "POST")
        				die(t9n("[RU]Для удаления записей используйте метод POST[EN]Please use a POST request to delete records"));
					check();
					Check_Grant($f_u, $id);  # Check the delete grant
				}
				elseif(Check_Grant($f_u, $id, "READ", FALSE) === FALSE)
					break;
			}
			elseif(isset($_REQUEST["_m_del_select"])){ # The user tries to drop the selection
				check();
				if(Grant_1level($id) != "WRITE")
					die(t9n("[RU]У вас нет доступа на изменение этих данных[EN]You have no grant to delete this data"));
			}
			elseif(Grant_1level($id) === FALSE)
				if($blocks["&main"]["CUR_VARS"]["parent_obj"])	# Array req via links
					Check_Grant($blocks["&main"]["CUR_VARS"]["parent_obj"], $id, "READ");
				else
					break;
			if((Grant_1level($id) == "WRITE") || Check_Grant($f_u, $id, "WRITE", FALSE))
				$blocks[$block]["create_granted"][] = "block";
			else
				$blocks[$block]["create_granted"][] = "none";

			if(isset($_REQUEST["order_val"]))
				$GLOBALS["ORDER_VAL"] = $_REQUEST["order_val"]=="val" ? "val" : (int)$_REQUEST["order_val"];
			else
				$GLOBALS["ORDER_VAL"] = 0;
# Gather all filter values to preserve them in HREF
			$f = "";
			foreach($_REQUEST as $key => $value)
				if(($value!="") && (preg_match("/(F\_|FR\_|TO\_)/", $key)))
					$f .= "&".$key."=".str_replace("\"", "&#34;", $value);
			if(isset($_REQUEST["f_show_all"]))
				$f .= "&f_show_all=1";
			if(isset($_REQUEST["full"]))
				$f .= "&full=0";
			if(isset($_REQUEST["lnx"]))
				if($_REQUEST["lnx"] == 1)
					$f .= "&lnx=1";
			$GLOBALS["FILTER"] = $f; # Remember the filter to use it in other blocks
			if(!isset($_REQUEST["desc"]) && ($GLOBALS["ORDER_VAL"]==="val")) # Revert the sort order, if needed
				$blocks[$block]["filter"][] = "$f&desc=0";
			else
				$blocks[$block]["filter"][] = $f;
			if(isset($blocks["&main"]["CUR_VARS"]["title"]))
			{
				$GLOBALS["parent_id"] = $f_u;
				$GLOBALS["parent_val"] = 0;

				$blocks[$block]["id"][] = $GLOBALS["GLOBAL_VARS"]["api"]["type"]["id"] = $id;
				$blocks[$block]["up"][] = $GLOBALS["GLOBAL_VARS"]["api"]["type"]["up"] = ($f_u > 1) ? $f_u : 1;
				$blocks[$block]["typ"][] = $id;
				$blocks[$block]["val"][] = $GLOBALS["GLOBAL_VARS"]["api"]["type"]["val"] = $blocks["&main"]["CUR_VARS"]["title"];
				$blocks[$block]["base_typ"][] = $GLOBALS["GLOBAL_VARS"]["api"]["base"]["id"] = $blocks["&main"]["CUR_VARS"]["typ"];
				$blocks[$block]["unique"][] = $GLOBALS["GLOBAL_VARS"]["api"]["base"]["unique"] = $blocks["&main"]["CUR_VARS"]["unique"] === "1" ? "unique" : "";
				$GLOBALS["REV_BT"][$id] = $GLOBALS["GLOBAL_VARS"]["api"]["type"]["base"] = $GLOBALS["REV_BT"][$blocks["&main"]["CUR_VARS"]["typ"]]; # the base type
				$blocks[$block]["f_i"][] = isset($_REQUEST["F_I"]) ? (int)$_REQUEST["F_I"] : "";
				$blocks[$block]["f_u"][] = isset($_REQUEST["F_U"]) ? (int)$_REQUEST["F_U"] : "";

				if(isset($_REQUEST["switch_links"]))
					$GLOBALS["lnx"] = ($_REQUEST["lnx"] == 1) ? 0 : 1;
				else
					$GLOBALS["lnx"] = isset($_REQUEST["lnx"]) ? (int)$_REQUEST["lnx"] : 0;

				$blocks[$block]["lnx"][] = $GLOBALS["lnx"];
				if($GLOBALS["lnx"] == 1)
				{
					$data_set = Exec_sql("SELECT typs.id, typs.up, objs.val, refs.val refr, typs.val attr
									FROM $z a, $z typs, $z objs, $z refs
									WHERE a.t=$id AND a.up=0 AND typs.t=a.id AND objs.id=typs.up AND refs.id=a.t"
							, "Get Links to this object");
					$GLOBALS["links"] = $GLOBALS["links_val"] = Array();
					while($row = mysqli_fetch_array($data_set))
					{
						$GLOBALS["links"][$row["id"]] = $row["up"];
						$GLOBALS["links_val"][$row["id"]] = $row["val"].".".FetchAlias($row["attr"], $row["refr"]);
					}
				}
#print_r($GLOBALS);die();
			}
			break;

		case "&uni_obj_parent":
			if($f_u > 1)
			{
				$data_set = Exec_sql("SELECT typs.id, typs.val typ, objs.val name, objs.up, base.t base FROM $z objs, $z typs, $z base
									WHERE typs.id=objs.t AND objs.id=$f_u AND base.id=typs.t", "Get Typ name and type");
				if($row = mysqli_fetch_array($data_set))
				{
					$blocks[$block]["tid"][] = $row["id"];
					$blocks[$block]["typ"][] = $row["typ"];
					$blocks[$block]["name"][] = Format_Val_View($row["base"], $row["name"]);
					$blocks[$block]["up"][] = $row["up"];
        			if(isApi())
        			{
            		    $GLOBALS["GLOBAL_VARS"]["api"]["parent"]["id"] = $row["id"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["parent"]["name"] = $row["name"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["parent"]["type"] = $row["typ"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["parent"]["up"] = $row["up"];
        			}
        			Check_Val_granted($row["id"], $blocks[$block]["name"][0], $row["id"]);
				}
			}
			else
                if(isset($GLOBALS["GRANTS"]["mask"][$blocks["&main"]["CUR_VARS"]["parent_obj"]]))
                    die(t9n("[RU]К объекту задан доступ по маске родителя - укажите ID родителя[EN]A mask is defined for the parent - please provide parent ID"));
			break;

		case "&uni_obj_head":
			if(isset($_POST["import"])||isset($_GET["import"])){
				check();
				constructHeader($id);
				$max_size = 8388608;
				if(!is_file($_FILES["bki_file"]["tmp_name"]))
					die(t9n("[RU]Выберите файл (максимальный размер: $max_size Б)[EN]Please select a file (max size is $max_size Bytes)"));
				if($_FILES["bki_file"]["size"] > $max_size)
					die(t9n("[RU]Ошибка. Максимальный размер файла: $max_size Б[EN]The maximum file size is $max_size B)"));
				$up = ($GLOBALS["parent_id"] > 1) ? $GLOBALS["parent_id"] : 1;
				$handle = fopen($_FILES["bki_file"]["tmp_name"], "r");
				$buffer = fgets($handle);
                # Remove BOM, if exists
            	if(substr($buffer, 0, 3) == pack('CCC', 0xef, 0xbb, 0xbf))
                    $buffer = substr($buffer, 3);
                if(substr($buffer, 0, 4) === "DATA")
                {
				    $plain_data = true; // Plain data with no definitions - the exact structure is already in place
				    trace("Plain DATA");
				    $i = $id;
                }
                else
    				$i = (int)substr($buffer, 0, strpos($buffer, ":"));
				if((!isset($GLOBALS["GRANTS"]["EXPORT"][1]) || !isset($GLOBALS["GRANTS"][1]) || $GLOBALS["GRANTS"][1] !== "WRITE")
				            && (!isset($GLOBALS["GRANTS"]["EXPORT"][$i]) || !isset($GLOBALS["GRANTS"][$i]) || $GLOBALS["GRANTS"][$i] !== "WRITE")
				            && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z)){
				    $ok = false;
				    if(isset($_POST["F_U"]))
				        $ok = Check_Grant((int)$_POST["F_U"], $i);
				    else if(isset($_POST["autoParent"]))
				        if($row = mysqli_fetch_array(Exec_sql("SELECT req.id FROM $z par, $z req WHERE par.up=0 AND req.up=par.id  AND req.t=$i AND par.id=".(int)$_POST["autoParent"], "Get req ID")))
    						$ok = isset($GLOBALS["GRANTS"]["EXPORT"][$row["id"]]) && $GLOBALS["GRANTS"][$row["id"]] === "WRITE";
    				if(!$ok)
					    die(t9n("[RU]У вас нет прав на загрузку объектов этого типа ($i)[EN]You are not granted to upload this type of objects ($i)"));
				}
				if($i > 1)
					constructHeader($i);	# Retrieve the existing data structure
				else
					die(t9n("[RU]Недопустимый тип метаданных $i [EN]Invalid metadata type $i"));
				$count = 1;
				if(!$plain_data){
#				print_r($GLOBALS);die($i);
    				# Check Typ's independence
    				if($i != $GLOBALS["GLOBAL_VARS"]["id"])
    				{
    					$sql = "SELECT a.val FROM $z a LEFT JOIN $z refs ON refs.id=a.t AND refs.t!=refs.id 
    								LEFT JOIN ($z obj CROSS JOIN $z req) ON obj.up=0 AND req.up=obj.id AND req.t=a.id
    							WHERE a.id=$i";
    					$data_set = Exec_sql($sql, "Check Typ's independence");
    					if($row = mysqli_fetch_array($data_set))
    					{
    						if(($up == 1) && ($row["up"] != 0))
    							die(t9n("[RU]Реквизит типа \"".$row[0]."\" (id=$i) необходимо загружать в его родительской записи".
    							    "[EN]The object \"".$row[0]."\" (id=$i) should be uploaded under its parent"));
    					}
    					else
    						if($up != 1)
    							die(t9n("[RU]Несуществующий реквизит типа $i (реквизиты можно импортировать только в составе типа)".
    							       "[EN]Non-exiting attribute of $i (attributes are uploaded within its parent definition)"));
    #print_r($GLOBALS);die($i);
    				}
    				# Validate Parent ID
    				if($up != 1)
    				{
    					$data_set = Exec_sql("SELECT reqs.t req, a.t par FROM $z a LEFT JOIN $z reqs ON reqs.up=a.t AND reqs.t=$i WHERE a.id=$up"
    										, "Validate Parent ID");
    					if($row = mysqli_fetch_array($data_set))
    					{
    						if($row["req"] != $i)
    							die(t9n("[RU]Реквизит типа $i отсутствует у родителя $up типа[EN]The $i type is missing from the $up type parent".$row["par"]));
    					}
    					else
    						die(t9n("[RU]Родительская запись с id=$i не найдена[EN]Parent record with id=$i not found"));
    				}
    				while(true)
    				{
    					if($buffer=="DATA\r\n" || $buffer=="DATA\n")	# Types end, data begins
    					{
    					    trace(" Types end, data begins");
    						break;
    					}
    					$object = explode(";", HideDelimiters($buffer));	# Get Types array
    					array_pop($object);	# Cut off the empty item after the last semi-colon
    					$order = 0;
    			        trace("typ ".$object[0]);
    					$typ = explode(":",  $object[0]);	# Get Type's attributes
    					$obj = $typ[0];
    					foreach($object as $value)
    					    $GLOBALS["imported"][$obj][$order++] = UnHideDelimiters($value);
    			        trace("(".$count++.") check $obj");
    			        if(count($typ) > 2) # Not a Reference type
        				    if(IsOccupied($obj)) # Check if the ID is occupied and resolve the conflict, if any
        				    {
            			        trace(" $obj is occupied");
            				    constructHeader($obj);
        				        if($GLOBALS["local_struct"][$obj][0] != $GLOBALS["imported"][$obj][0])
        				            ResolveType($typ);
        				    }
        				    else # The ID is free - create the Object with this ID
        				    {
        				        trace(" create the Object ".$obj);
                                exec_sql("INSERT INTO $z (id, up, ord, t, val) VALUES ($obj, 0, ".(isset($typ[3])?"1":"0").", ".$GLOBALS["BT"][$typ[2]].", '".addslashes($typ[1])."')"
                                            , "Import Obj with ID");
                                $GLOBALS["local_struct"][$obj][0] = $GLOBALS["imported"][$obj][0];
        				    }
        				if(feof($handle))
        				    break;
    					$buffer = fgets($handle);
    				}
    #print_r($GLOBALS);my_die();
                    trace("Start reconciling the objects");
                    $GLOBALS["local_types"] = Array();
    				foreach($GLOBALS["imported"] as $par => $reqs)
    				{
    			        $parent = CheckSubst($par);
    			        foreach($reqs as $order => $req)
    			        {
    				        if($order == 0)
    				            continue;
    				        trace(" Imported req $order ".$reqs[$order]);
    			            $typ = UnHideDelimiters(explode(":",  HideDelimiters($req)));
    			            $value = $typ[0].":".CheckSubst($typ[1]);
    			            if($typ[0] == "ref")
    			            {
    			                trace($typ[1]." is a ref");
    	    		            $value .= $typ[2];
    			            }
    			            $found = false;
    			            foreach($GLOBALS["local_struct"][$parent] as $local_type => $local_value)
    			                if($found = ($value == substr($local_value, 0, strlen($value))))
    			                    break;
    				        if($found)
    				        {
        				        trace("  match found for $value");
        				        if($req == $local_value)
            				        trace("   this is a full match $req => $local_value");
        				        else
        				        {
            				        trace("   adjust $req => $local_value");
        				            $local = UnHideDelimiters(explode(":",  HideDelimiters($local_value)));
        				        }
        				        if($typ[0] == "ref")
            				        $GLOBALS["local_types"][$par][$order] = $typ[2];
            				    else
            				        $GLOBALS["local_types"][$par][$order] = $local_type;
    				        }
    				        elseif($typ[0] == "ref")
    				        {
    						    trace(" Define ref req $order ".$typ[1]." as $req. Ref ID is ".$typ[2]);
    						    $reqID = $typ[1];
    						    $refID = $typ[2];
                                $obj = explode(":",  $GLOBALS["imported"][$typ[2]][0]);
    						    trace("  ref Obj is ".$obj[1]." substituted by ".CheckSubst($obj[1]));
    						    $obj = CheckSubst($obj[1]);
        						# Create a ref to Object, if not exists
    							if(IsOccupied($refID))
    							{
    							    $row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE up=0 AND t=$obj AND val=''", "Seek Ref"));
    							    if($row["id"])
    							    {
    							        $refID = $row["id"];
    							        trace("  the ref $refID to $obj exists");
    							    }
    							    else
                                        $refID = $GLOBALS["local_struct"]["subst"][$refID] = Insert(0, 0, $obj, "", "Import Ref without ID");
    							}
                                else
                                    exec_sql("INSERT INTO $z (id, up, ord, t, val) VALUES ($refID, 0, 0, $obj, '')", "Import Ref with ID");
    	    		            $GLOBALS["refs"][$refID] = "";
        						# Create a ref Req, if not exists
    							if(IsOccupied($reqID))
    							{
    							    $row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE t=$refID AND up=$parent", "Seek ref Req"));
    							    if($row["id"])
    							    {
    							        $reqID = $row["id"];
    							        trace("  the ref req $reqID to $obj exists");
    							    }
    							    else
                                        $reqID = $GLOBALS["local_struct"]["subst"][$reqID] = Insert($parent, $order, $refID, isset($typ[3])?UnMaskDelimiters($typ[3]):""
                                                        , "Import ref Req without ID");
    							}
                                else
                                    exec_sql("INSERT INTO $z (id, up, ord, t, val) VALUES ($reqID, $parent, $order, $refID, '')", "Import ref Req with ID");
                                trace("  attrs:".(isset($typ[3])?UnMaskDelimiters($typ[3]):""). " - ".MULTI_MASK);
                        		if(strpos(isset($typ[3])?UnMaskDelimiters($typ[3]):"", MULTI_MASK) !== FALSE){
                        			$GLOBALS["MULTI"][$reqID] = $refID;
                        			trace("set $reqID = $refID MULTI");
                        		}
    	    		            $GLOBALS["refs"][$reqID] = $refID;
                                $GLOBALS["local_types"][$par][$order] = CheckSubst($reqID);
    				        }
    				        elseif($typ[0] == "arr")
    				        {
        				        $i = CheckSubst($typ[1]);
    						    trace("   Define array req ".$typ[1]." $reqs[$order] as ".$GLOBALS["imported"][$typ[1]][0]);
            				    $reqID = Insert($parent, $order, $i, isset($typ[2])?UnMaskDelimiters($typ[2]):"", "Import arr Req");
    							$GLOBALS["local_struct"][$parent][$reqID] = $reqs[$order];	# Register the new Req
        				        $GLOBALS["local_types"][$par][$order] = $reqID;
        				        $GLOBALS["parents"][$i] = $parent;
    				        }
        				    else # A plain req - find an analogue or register the new one
        				    {
        				        trace("   $req is a plain req - find an analogue or register the new one");
    							$data_set = Exec_sql("SELECT id FROM $z WHERE val='".addslashes($typ[0])."' AND up=0 AND id!=t AND t=".$GLOBALS["BT"][$typ[1]], "Seek Req Typ");
    							if($row = mysqli_fetch_array($data_set))	# The Type of the Req exists - add the Req to the Type
    								$i = $row["id"];
    							else	# No analogue, register the new one
    								$i = Insert(0, 0, $GLOBALS["BT"][$typ[1]], $typ[0], "Import new Type for Req");
    							$i = Insert($parent, Get_Ord($parent), $i, isset($typ[2])?UnMaskDelimiters($typ[2]):"", "Import new Req");
    							$GLOBALS["local_struct"][$parent][$i] = $req;	# Register the new Req
        				        $GLOBALS["local_types"][$par][$order] = $i;
        				    }
        		        }
    				}
				}
				trace("Data");
#print_r($GLOBALS);my_die();
				$GLOBALS["cur_parent"][0] = $up;
				if($plain_data){
				    $getParent = FALSE;
					if(isset($GLOBALS["cur_parent"][$GLOBALS["parents"][$id]])){
						$parent = $GLOBALS["cur_parent"][$GLOBALS["parents"][$id]];
						if($parent != 1)
    						$cur_order = Get_ord($parent, $id);
					}
					else
						$parent = 1;
				    if(isset($_POST["autoParent"])){ // Override the parent in case it is to be derived from the first column
			            $getParent = TRUE;
			            $parentType = (int)$_POST["autoParent"];
			            if($parentType > 1){
    					    $sql = "SELECT par.t FROM $z par, $z req WHERE par.up=0 AND req.up=par.id AND par.id=$parentType AND req.t=$id";
    						if($row = mysqli_fetch_array(Exec_sql($sql, "Get parent and its type"))){
        			            $parentBase = $row["t"];
        			            $knownParents = Array();
    						}
        		            else
    					        my_die(t9n("[RU]Не найден родитель (autoParent)[EN]Parent not found (autoParent)"));
			            }
    		            else
					        my_die(t9n("[RU]Неверный тип родителя (autoParent)[EN]Wrong parent type (autoParent)"));
				    }
					$typesCount = isset($GLOBALS["local_types"][$id]) ? count($GLOBALS["local_types"][$id]) : count($GLOBALS["local_struct"][$id]);
					if($getParent)
					    $typesCount++;
					$isUnique = $GLOBALS["uniq"][$id] === "1";
				    trace("$id is ".($isUnique?"":"not ")."unique");
    				while(!feof($handle)){
    					$buffer = fgets($handle);	# Read the line
    					if(strlen($buffer)==0)
    						continue;
    					$object = UnHideDelimiters(explode(";", HideDelimiters($buffer)));	# Get fields array
                        if($object[0] == ""){
                            $GLOBALS["warning"] .= t9n("[RU]Пропущен пустой объект типа $id (строка $count)[EN]Empty object of type $id skipped (string #$count)");
                            #my_die(t9n("[RU]Пустой объект типа $id (строка $count)[EN]Empty object of type $id (string $count)"));
                            continue;
                        }
    					while(count($object) <= $typesCount)	# There might be line breaks
    					{
    					    if(feof($handle))
    					        my_die(t9n("[RU]Неожиданный конец файла [EN]Unexpected end of file"));
    						$buffer .= fgets($handle);	# Continue retrieving lines until we collect all the Reqs
    						$object = UnHideDelimiters(explode(";", HideDelimiters($buffer)));
        					$count++;
    					}
    					end($object);
    					$object[key($object)] = rtrim(current($object), "\t\n\r\0\x0B"); // Remove CR, LF and other ending chars, if any
    					unset($existing);
        				trace("(".$count++.") Buffer: $buffer");
    					if($getParent){
    					    $orid = is_numeric($object[0]) ? "OR par.id=".(int)$object[0] : "";
    					    $sql = "SELECT par.id, max(reqs.ord) ord FROM $z par LEFT JOIN $z reqs ON reqs.up=par.id AND reqs.t=$id "
    					                ."WHERE par.t=$parentType AND (par.val='".addcslashes(Format_Val($parentBase,UnMaskDelimiters($object[0])), "\\\'")."' $orid)  HAVING par.id IS NOT NULL";
							if($row = mysqli_fetch_array(Exec_sql($sql, "Get the parent and order for this rec"))){
							    $parent = $row["id"];
							    $cur_order = 1+$row["ord"];
							}
						    elseif(isset($_POST["createParent"])){
						        $parent = Insert(1, 1, $parentType, addcslashes(Format_Val($parentBase,UnMaskDelimiters($object[0])), "\\\'"), "Auto create parent");
						        $cur_order = 1;
						    }
						    else{
                                $GLOBALS["warning"] .= t9n("[RU]Пропущен объект с ненайденным родителем (строка $count)[EN]The object skipped for no parent found (string #$count)");
                                continue;
						    }
						    array_shift($object);
    					}
    					$object[0] = Format_Val($GLOBALS["base"][$id], UnMaskDelimiters($object[0]));
					    $reqs = Array();
					    $ids = Array();
    					if($isUnique){
    					    $result = Exec_sql("SELECT obj.id, reqs.t, reqs.val, reqs.id reqid
    					                            FROM $z obj LEFT JOIN $z reqs ON reqs.up=obj.id AND reqs.t!=0
    					                            WHERE obj.up=$parent AND obj.t=$id AND obj.val='".addcslashes($object[0], "\\\'")."'
    					                            ORDER BY obj.id"
    					                        , "Check unique Obj and its reqs");
            			    if($row = mysqli_fetch_array($result)){
				                $existing = $row["id"];
        				        trace(" found existing $existing ".$object[0]." base=".$GLOBALS["REV_BT"][$GLOBALS["base"][$row["t"]]]);
        				        do{
        				            if($existing !== $row["id"]) // There may be several matches, take only the first one
        				                break;
        				            if($row["t"]){
                    			        $reqs[$row["t"]] = $row["val"];
                    			        $ids[$row["t"]] = $row["reqid"];
                				        trace("  existing req ".$row["t"]." = ".$reqs[$row["t"]]);
        				            }
                			    } while($row = mysqli_fetch_array($result));
            			    }
        				    else
        				        trace(" not found ".$object[0]);
    					}
    					if(isset($existing))
        					$new_id = $existing;
    					else
							$new_id = Insert($parent, (isset($cur_order) ? $cur_order++ : 1), $id, $object[0], "Plain import #$count");
    					#array_pop($object); 	# Cut off the empty item after the last semi-colon
    					$order = 0;
    					foreach($GLOBALS["local_struct"][$id] as $key => $value){
                            if($key == 0)
                                continue;
                            $order++;
        				    trace(" Parse $key ".$object[$order]." of $value");
    						if(strlen($object[$order])){
    						    $val = Format_Val($GLOBALS["base"][$key], UnMaskDelimiters($object[$order]));
            				    trace(" isset(existing)=".isset($existing)." && isset(reqs[$key])=".isset($reqs[$key]));
    							if(isset($GLOBALS["refs"][$key])){ // Reference object
                				    trace(" Reference object $key");
    							    $refType = $GLOBALS["refs"][$key];
            						if($object[$order] === " "){
                    				    trace("  Delete Reference object $key");
        								$data_set = Exec_sql("SELECT req.id FROM $z req, $z ref"
        								                    ."   WHERE req.up=$new_id AND req.val='$key' AND ref.id=req.t AND ref.t=$refType"
        								                    , "Get refs to delete");
                        				while($row = mysqli_fetch_array($data_set))
                						    Delete($row["id"]);
            						}
            						else{
        						        if(isset($GLOBALS["MULTI"][$key]))
        						            $multies = UnHideDelimiters(explode(",", HideDelimiters($object[$order])));	# Get multiselect items set
        						        else
        						            $multies = array($object[$order]);
        					            $ord = 1;
                    					foreach($multies as $ref){
                    					    $ref = trim($ref);
            							    if(isset($GLOBALS["refs"][$refType]))
                							    if(isset($GLOBALS["refs"][$refType][$ref])){
                							        // if(!isset($existing) // It is a ref of a new rec
                							                // || (isset($GLOBALS["MULTI"][$key]) && !isset($reqs[$GLOBALS["refs"][$refType][$ref]]))) // or multiple ref yet not on the list
                							        if(!isset($reqs[$GLOBALS["refs"][$refType][$ref]])) // ref yet not on the list
                        							    Insert($new_id, 1, $GLOBALS["refs"][$refType][$ref], $key, "Import cached plain ref");
                        							    // Insert_batch($new_id, 1, $GLOBALS["refs"][$refType][$ref], $key, "Import cached plain ref");
                    							    continue;
                    						    }
            								if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE t=$refType AND val='".addslashes($ref)."'", "Check plain ref Obj Value")))
            								    $refObjID = $row["id"];
            								else
            								    $refObjID = Insert(1, 1, $refType, $ref, "Import plain ref Object");
            								if(!isset($GLOBALS["MULTI"][$key])){
                            				    trace("    Check existing ref $key $refType");
                    						    foreach($reqs as $rid => $req){
                                				    trace("    rid $rid => req $req ($req === $key)");
                    						        if($req == $key){
                                    				    trace("    req $req === key $key, rid $rid === refObjID $refObjID");
                    						            if($refObjID !== $rid)
                                							UpdateTyp($ids[$rid], $refObjID);
                    						            continue 2;
                    						        }
                    						    }
            								}
            								if(!isset($reqs[$refObjID]))
                    							Insert($new_id, $ord++, $refObjID, $key, "Import plain ref");
                							// Insert_batch($new_id, $ord++, $refObjID, $key, "Import plain ref");
                							$GLOBALS["refs"][$refType][$ref] = $refObjID;
                    					}
            						}
    						    }
    						    elseif(isset($existing) && isset($reqs[$key])){
    						         # Drop false BOOLEAN: -1 or FALSE
    						        if($GLOBALS["base"][$key] === "11" /* BOOLEAN */ && (strtolower($object[$order]) === "false" || $object[$order] === "-1" || $object[$order] === " "))
    						            Delete($ids[$key]);
    						        elseif($reqs[$key] !== $val)
    						            if($val === " ")
        						            Delete($ids[$key]);
    						            else
        						            Update_Val($ids[$key], $val);
    						    }
    							else // Ordinary attribute of some base type
    							    # Skip false BOOLEAN: -1 or FALSE
						            if($GLOBALS["base"][$key] === "11" /* BOOLEAN */ && (strtolower($object[$order]) === "false" || $object[$order] === "-1" || $object[$order] === " "))
						                ;
						            elseif($val !== " ")
        								Insert($new_id, 1, $key, $val, "Import plain req");
    								//Insert_batch($new_id, 1, $key, $val, "Import plain req");
    						}
    				    }
    				}
				}
				else
				while(!feof($handle)){
					$buffer = fgets($handle);	# Read the line
					if(strlen($buffer)==0)
						continue;
					$object = UnHideDelimiters(explode(";", HideDelimiters($buffer)));	# Get Types array
    				trace("");
					$typ = UnHideDelimiters(explode(":", HideDelimiters($object[0])));	# Get Type's attributes
    				trace("Object: ".$object[0].", typ: ".$typ[0]);
                    if(count($typ) == 4) # Reference attribute
                    {
					    trace("Reference attribute ".$object[0]);
                        $isref = CheckSubst((int)array_shift($typ)); # Remember the Ref attribute
                    }
    				$orig = (int)$typ[0];	# Get the imported Type
					while(count($object) <= count($GLOBALS["imported"][$orig]))	# There might be line breaks
					{
					    if(feof($handle))
					        my_die(t9n("[RU]Неожиданный конец файла[EN]Unexpected end of file"));
						$buffer .= fgets($handle);	# Continue retrieving lines until we collect all the Reqs
						$object = UnHideDelimiters(explode(";", HideDelimiters($buffer)));
    					$count++;
					}
    				$t = CheckSubst($orig);	# Detect the target Type
					if(!isset($GLOBALS["local_struct"][$t]))
						my_die(t9n("[RU]Строка $count: Недопустимый тип $t, остутствующий в мета-данных[EN]Line $count: Invalid type $t that is not present in the metadata")." ($buffer)");
    				trace("(".$count++.") Buffer: $buffer");
#print_r($GLOBALS);my_die();
					array_pop($object);	# Cut off the empty item after the last semi-colon
					$new_id = $order = 0;
					foreach($object as $value)
					{
					    trace(" Parse $value, t:$t, orig:$orig");
						if($new_id)
						{
                            $order++;
							$key = $GLOBALS["local_types"][$orig][$order];
                            trace(" order:$order: key:$key of t:$orig ($t)");
#print_r($GLOBALS);my_die();
                            if($key == "")
                                my_die(t9n("[RU]Тип $orig ($t) не имеет реквизита №$order (дано слишком много реквизитов)[EN]The type $orig ($t) does not have attribute #$order (too many attributes)"));
							if(strlen($value))
								if(!isset($GLOBALS["refs"][$key])) // Ordinary attribute of some base type
									Insert_batch($new_id, 1, $key, UnMaskDelimiters($value), "Import req");
								elseif(isset($GLOBALS["MULTI"][$key])){ // Reference might be set by multi ID
						            $multies = explode(",", $value);	# Get multiselect items set
    					            $ord = 1;
                					foreach($multies as $ref)
								        if((int)$ref != 0)
									        Insert_batch($new_id, $ord++, CheckObjSubst((int)$ref), $key, "Import multi ref");
        						}
								elseif((strpos($value, ":") !== FALSE) // Referenced object set by Value like "ID:Value" or ":Value"
								        || ((int)$value == 0))  // or just "Value"
								{
								    if((strpos($value, ":") === FALSE))  // just "Value"
								    {
								        $refObjID = 0;
    								    $refObjVal = $value;
								    }
								    else // ":Value"
								    {
    								    $tmp = UnHideDelimiters(explode(":", HideDelimiters($value)));
    								    $refObjID = (int)$tmp[0];
    								    $refObjVal = $tmp[1];
								    }
								    if(!isset($GLOBALS["local_types"][$key])) // Remember the $key to fetch it faster
								    {
    								    $tmp = explode(":", $GLOBALS["local_struct"][$key][0]);
								        $GLOBALS["local_types"][$key] = $tmp[1];
								    }
								    $refType = $GLOBALS["local_types"][$key];
								    if(!($refType > 0))
                						my_die(t9n("[RU]Строка $count: Тип $key остутствует в мета-данных[EN]Line $count: Type $key is not present in the metadata")." ($buffer)");
                                    trace("   ref type: $refType");
								    $refObjVal = addslashes(UnMaskDelimiters($refObjVal));
								    if($refObjID > 0) // "ID:Value"
								    {
        								if($row = mysqli_fetch_array(Exec_sql("SELECT t, val FROM $z WHERE id=$refObjID", "Check ref Obj ID")))
        								{
        								    trace("The object exists t=".$row["t"]." value=".$row["val"]);
        									if($row["t"] != $refType)	# The object exists, but the type is wrong
        									{
            								    trace(" the type is wrong ".$row["t"]." != $refType");
            									$refObjID = $GLOBALS["obj_subst"][$refObjID] = Insert(1, 1, $refType, $refObjVal, "Import new ID");
            									
        									}
        								}
        								elseif(strlen($refObjVal))	# The object does not exist
            								exec_sql("INSERT INTO $z (id, up, ord, t, val) VALUES ($refObjID, 1, 1, $refType, '$refObjVal')", "Import ref Obj with ID");
								    }
								    elseif(strlen($refObjVal)) // ":Value" - just create the new Object
								    {
        								if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE t=$refType AND val='$refObjVal'", "Check ref Obj Value")))
        								    $refObjID = $row["id"];
        								else
        								    $refObjID = Insert(1, 1, $refType, $refObjVal, "Import direct ref Object");
								    }
									Insert_batch($new_id, 1, $refObjID, $key, "Import direct ref");
								}
								elseif((int)$value != 0) // Reference set by ID
									Insert_batch($new_id, 1, CheckObjSubst((int)$value), $key, "Import ref");
						}
						else
						{
                            if($typ[2] == "")
                                my_die(t9n("[RU]Строка $count: Пустой объект типа $t (строка $count)[EN]Line $count: Empty object of type $t (string $count)")." ($buffer)");
							if(isset($GLOBALS["cur_parent"][$GLOBALS["parents"][$t]]))
							{
								$parent = $GLOBALS["cur_parent"][$GLOBALS["parents"][$t]];
								if(isset($GLOBALS["cur_order"][$parent]))
								    $ord = ++$GLOBALS["cur_order"][$parent];
								else
								    $ord = $GLOBALS["cur_order"][$parent] = Get_ord($parent, $t);
							}
							else
								$parent = $ord = 1;
							$typ[2] = UnMaskDelimiters($typ[2]);
							if($typ[1] == "")
								$new_id = Insert($parent, $ord, $t, $typ[2], "Import no ID");
							else
							{
								$new_id = $typ[1];
								if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE t=$t AND val='".addslashes($typ[2])."'", "Check Obj presence"))){
									$new_id = $GLOBALS["obj_subst"][$new_id] = $row["id"];
								}
								elseif($row = mysqli_fetch_array(Exec_sql("SELECT t, val FROM $z WHERE id=$new_id", "Check ID presence")))
								{
									if(($row["t"] == $t) && ($row["val"] == $typ[2]))	# The object exists
										break;
									$new_id = $GLOBALS["obj_subst"][$new_id] = Insert($parent, $ord, $t, $typ[2], "Import new ID");
								}
								elseif($isref) # Insert Reference, ToDo: fix to support ref's parent - up
    								exec_sql("INSERT INTO $z (id, up, ord, t, val) VALUES ($new_id, 1, 1, $t, '".addslashes($typ[2])."')", "Import ref with ID");
    							else
									exec_sql("INSERT INTO $z (id, up, ord, t, val) VALUES ($new_id, $parent, $ord, $t, '".addslashes($typ[2])."')", "Import with ID");
							}
							$GLOBALS["cur_parent"][$t] = $new_id;
						}
					}
#					echo $buffer;
				}
				Insert_batch("", "", "", "", "Import");
				fclose($handle);
#				print_r($GLOBALS["parents"]);print_r($GLOBALS["local_struct"]);die("$ftell=".$buffer);
#print($header);#print_r($blocks["typ"]);print_r($blocks["typ"]);print_r($GLOBALS);die();
			}
			# We might need Reference type in meta-data - add a synthetic one
			$GLOBALS["BT"]["REFERENCE"] = 0;  # Reference type
			$GLOBALS["REV_BT"][0] = "REFERENCE";
			$GLOBALS["DESC"] = isset($_REQUEST["desc"]) ? "DESC" : "";
			$GLOBALS["PG"] = isset($_REQUEST["pg"]) ? max($_REQUEST["pg"], 1) : 1;
			$sql = "SELECT CASE WHEN arrs.id IS NULL THEN a.id ELSE typs.id END t, CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END base_typ
						, CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END val, refs.id ref_id, arrs.id arr_id, a.val attrs, a.id
					FROM $z a, $z typs LEFT JOIN $z refs ON refs.id=typs.t AND refs.t!=refs.id
							LEFT JOIN $z arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
					WHERE a.up=$id AND typs.id=a.t ORDER BY a.ord";
			$data_set = Exec_sql($sql, "Get all Names of Reqs of the Typ");
			$GLOBALS["no_reqs"] = mysqli_num_rows($data_set) == 0; # Check if the Type has any Reqs
			$ord = 0;
			while($row = mysqli_fetch_array($data_set)){
				if(isset($GLOBALS["GRANTS"][$row["id"]])) # Skip barred Reqs - hide them
					if($GLOBALS["GRANTS"][$row["id"]] == "BARRED")
						continue;

				$blocks[$block]["grant"][] = isset($GLOBALS["GRANTS"][$row["id"]]) ? $GLOBALS["GRANTS"][$row["id"]] : "";
#print_r($GLOBALS);die();
                $val = isset($row["ref_id"]) ? FetchAlias($row["attrs"], $row["val"]) : $row["val"];
				$blocks[$block]["val"][] = $val;
				$blocks[$block]["typ"][] = $row["id"];
				$blocks[$block]["base_typ"][] = $row["base_typ"];
				$blocks[$block]["ref_type"][] = $row["ref_id"] ? "ref-type=\"".$row["ref_id"]."\"" : "";
				$blocks[$block]["arr_type"][] = $row["arr_id"] ? "arr-type=\"".$row["t"]."\"" : "";
				$blocks[$block]["id"][] = $id;
				$blocks[$block]["mandatory"][] = strpos($row["attrs"], NOT_NULL_MASK) === false ? "" : "mandatory";
				$blocks[$block]["array"][] = $row["arr_id"] != 0 ? "arr" : "";

				$GLOBALS["attrs"][$row["t"]] = $row["attrs"];  # The template name for BUTTON
				$GLOBALS["REV_BT"][$row["t"]] = $GLOBALS["REV_BT"][$row["base_typ"]]; # Remember the base type for each Req

				if(isApi() && !isset($_REQUEST["JSON_DATA"])){
			        $GLOBALS["GLOBAL_VARS"]["api"]["req_base"][$row["t"]] = $row["base_typ"]==="0" ? "TAB_DELIMITER" : $GLOBALS["REV_BT"][$row["base_typ"]];
			        $GLOBALS["GLOBAL_VARS"]["api"]["req_base_id"][$row["t"]] = $row["base_typ"];
			        $GLOBALS["GLOBAL_VARS"]["api"]["req_attrs"][$row["t"]] = $row["attrs"];
			        $GLOBALS["GLOBAL_VARS"]["api"]["req_type"][$row["t"]] = $val;
    				if($row["ref_id"] != 0)
	    		        $GLOBALS["GLOBAL_VARS"]["api"]["ref_type"][$row["t"]] = $row["ref_id"];
    				if($row["arr_id"])
	    		        $GLOBALS["GLOBAL_VARS"]["api"]["arr_type"][$row["t"]] = $row["arr_id"];
			        $GLOBALS["GLOBAL_VARS"]["api"]["req_order"][$ord++] = $row["t"];
    			}
				if($row["arr_id"] != 0) # Remember this to simplify the request for Reqs later
				{
					$GLOBALS["REV_BT"][$row["t"]] = "ARRAY";
					$GLOBALS["HAVE_ARR"] = "";
					$GLOBALS["ARR_typs"][$row["t"]] = $GLOBALS["REV_BT"][$row["base_typ"]];
				}
				if($row["ref_id"] != 0)
				{
					$GLOBALS["HAVE_REF"] = "";
					$GLOBALS["REF_typs"][$row["t"]] = $row["ref_id"];  # Save the Typ of the referenced Object
            		if(strpos($row["attrs"], MULTI_MASK) !== FALSE){
            			$GLOBALS["MULTI"][$row["t"]] = $row["ref_id"];
    				    $blocks[$block]["multi"][] = "t-multi";
            		}
            		else
    				    $blocks[$block]["multi"][] = "";
    				$blocks[$block]["ref"][] = "t-ref";
    				# Check if we got a query for the DDL
				    $attrs = removeMasks($row["attrs"]);
					if(strlen($attrs) > 0)
						if(BuiltIn($attrs) == $attrs) # Calc predefined value
						    $GLOBALS["STORED_REPS"][$row["id"]]["ddl"] = $attrs; # BuiltIn gave nothing - try calculatables
				}
				else{
				    $GLOBALS["NonREF_typs"][$row["t"]] = "";
    				$blocks[$block]["ref"][] = "";
				    $blocks[$block]["multi"][] = "";
				}

				$GLOBALS["REQS"][$row["t"]] = $row["base_typ"]; # Store Reqs for filter constructor
				$GLOBALS["REQNAMES"][$row["t"]] = $row["val"]; # Names of reqs
				$f = $GLOBALS["FILTER"];
				if(!isset($_REQUEST["desc"]) && ($GLOBALS["ORDER_VAL"]==$row["t"])) # Revert the sort order, if needed
					$blocks[$block]["filter"][] = "$f&desc=0";
				else
					$blocks[$block]["filter"][] = $f;
			}
			if(isset($_REQUEST["csv"]))
			{
				if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && !isset($GLOBALS["GRANTS"]["EXPORT"][$id]) && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z))
					die(t9n("[RU]У вас нет прав на выгрузку объектов этого типа[EN]You do not have access to upload this type of object"));
				# First add the first column
				if(is_array($blocks[$block]["val"]))
					array_unshift($blocks[$block]["val"], $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]);
				else
					$blocks[$block]["val"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"];
				foreach ($blocks[$block]["val"] as $key => $value)
					$blocks[$block]["val"][$key] = iconv("utf-8", "windows-1251", $value);
				download_send_headers("data_export.csv");
				ob_start();
				$GLOBALS["CSV_handler"] = fopen("php://output", 'w');
				fputcsv($GLOBALS["CSV_handler"], $blocks[$block]["val"], ';');
			}
			elseif(isset($GLOBALS["dataExport"]))
			{
				if(!isset($GLOBALS["GRANTS"]["EXPORT"][1]) && !isset($GLOBALS["GRANTS"]["EXPORT"][$id]) && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z))
					die(t9n("[RU]У вас нет прав на выгрузку объектов этого типа[EN]You do not have access to upload this type of object"));
				# First add the first column
				constructHeader($id);
#print($header);#print_r($blocks["typ"]);print_r($blocks["typ"]);print_r($GLOBALS);die();
			}
			break;

		case "&delete":
		case "&export":
			if(isset($GLOBALS["GRANTS"][strtoupper(substr($block_name,1))][1]) || isset($GLOBALS["GRANTS"][strtoupper(substr($block_name,1))][$id]) || ($GLOBALS["GLOBAL_VARS"]["user"] == "admin") || ($GLOBALS["GLOBAL_VARS"]["user"] == $z))
				$blocks[$block]["ok"][] = "";
			break;

		case "&uni_obj_head_links":
		case "&uni_obj_head_filter_links":
		case "&uni_object_view_reqs_links":
			if($GLOBALS["lnx"] ==  1)
				$blocks[$block]["val"][] = "";
			break;

		case "&uni_obj_head_filter":
			if(isset($GLOBALS["REQS"]))  # There might be no Reqs
				foreach($GLOBALS["REQS"] as $key => $value)
				{
					$blocks[$block]["typ"][] = $key;
					$blocks[$block]["base_typ"][] = $value;
					$blocks[$block]["dd"][] = isset($GLOBALS["REF_typs"])?(isset($GLOBALS["REF_typs"][$key])?"dropdown-toggle":""):"";
					$blocks[$block]["ref"][] = isset($GLOBALS["REF_typs"])?(isset($GLOBALS["REF_typs"][$key])?$GLOBALS["REF_typs"][$key]:$key):$key;
				}
			break;

		case "&filter_val_rcm":
		case "&filter_val_dns":
		case "&filter_req_rcm":
		case "&filter_req_dns":
			$cur_typ = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
			if(in_array($GLOBALS["REV_BT"][$blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["base_typ"]]
						, array("DATE","NUMBER","SIGNED","DATETIME")))
			{
				$blocks[$block]["f_typ_fr"][] = "FR_".$cur_typ;
				$blocks[$block]["filter_fr"][] = isset($_REQUEST["FR_".$cur_typ]) ? str_replace(" ","",$_REQUEST["FR_".$cur_typ]) : "";
				$blocks[$block]["f_typ_to"][] = "TO_".$cur_typ;
				$blocks[$block]["filter_to"][] = isset($_REQUEST["TO_".$cur_typ]) ? str_replace(" ","",$_REQUEST["TO_".$cur_typ]) : "";
			}
			else
			{
				$blocks[$block]["f_typ"][] = "F_$cur_typ";
				$blocks[$block]["filter"][] = isset($_REQUEST["F_$cur_typ"]) ? str_replace("\"", "&#34;", $_REQUEST["F_$cur_typ"]) : "";
			}
			break;

		case "&uni_obj_all":
			if(isset($GLOBALS["HAVE_ARR"]))  # Get base types for array Reqs (to simplify the filtering later)
			{
				$data_set = Exec_sql("SELECT arr_reqs.t req_typ, base_typs.t base_typ
										FROM $z reqs, $z arr_reqs, $z base_typs
										WHERE reqs.up=$id AND arr_reqs.up=reqs.t AND base_typs.id=arr_reqs.t"
								, "Get base types for array Reqs");
				$ref_list = "";
				while($row = mysqli_fetch_array($data_set))
				{
					if($row["req_typ"] == "") # Remember the Reference types list
					{
						if($ref_list == "")
							$ref_list = $row["req_typ"];
						else
							$ref_list .= ",".$row["req_typ"];
					}
					# Remember the base type
					$GLOBALS["REV_BT"][$row["req_typ"]] = isset($GLOBALS["REV_BT"][$row["base_typ"]]) ? $GLOBALS["REV_BT"][$row["base_typ"]] : "SHORT";
				}
			}
# Prepare Filter conditions
			$joins = $filter_tables = $filter_cond = $GLOBALS["distinct"] = $filter_by_id = $parent_cond = "";
			$cur_typ = $id;
			$cur_base_typ = $blocks["&main"]["CUR_VARS"]["typ"];
			$filter_by_id_off = FALSE;
			$GLOBALS["where"] = $GLOBALS["join"] = $GLOBALS["join_cond"] = "";
			if(isset($_REQUEST["F_U"]) && $blocks["&main"]["CUR_VARS"]["parent_obj"]){
			    if((int)$_REQUEST["F_U"] > 0)
			    	$filter_cond .= " AND vals.up=".(int)$_REQUEST["F_U"]." ";
			    else
			    	$filter_cond .= " AND vals.up!=0 ";
			}
			elseif(isset($_REQUEST["F_I"]) && ((int)$_REQUEST["F_I"] > 0))
				$parent_cond = " ";  # skip the parent cond in case the exact filter is set
			else
				$parent_cond = " AND vals.up=1 ";  # By default for Root's children

			foreach($_REQUEST as $key => $value)
				if(($value != "") && (preg_match("/(F\_|FR\_|TO\_)/", $key))){
					$GLOBALS["CONDS"][substr($key, strpos($key, "_")+1)][substr($key, 0, strpos($key, "_"))] = $value;
					if(substr($value, 0, 1) === "@")
    					$parent_cond = " ";
				}

			if(isset($GLOBALS["CONDS"]))
				foreach($GLOBALS["CONDS"] as $key => $value){
					if($key == "U") # Filter on Up
						continue;
					elseif(($key == "I") && ($value["F"] != 0)) # Filter on ID
						$filter_by_id = " AND vals.id=".(int)$value["F"]." ";
					elseif($key != 0){ # Not U or I
						$filter_by_id_off = TRUE; # Clear $filter_by_id in case we have other conditions
						if(isset($GLOBALS["STORED_REPS"][$key]["ddl"])){
							trace("We got a query for the $key DDL \r\n".$GLOBALS["STORED_REPS"][$key]["ddl"]);
							trace(" Where is: ".$value["F"]);
    						$id_bak = $id;
    						$where_bak = $GLOBALS["where"];
    						$joins_bak = $GLOBALS["join"];
    						$GLOBALS["REQREF"]["2"] = $value["F"];
                			$refIn = "";
    						$id = Get_block_data($GLOBALS["STORED_REPS"][$key]["ddl"], FALSE, TRUE); # Prepare the query
    						if($GLOBALS["STORED_REPS"][$id]["sql"]){
    						    $GLOBALS["STORED_REPS"][$key]["sql"] = $GLOBALS["STORED_REPS"][$id]["sql"];
    							trace("We got a query for $key -> "." DDL (".$GLOBALS["STORED_REPS"][$key]["ddl"].") $id\r\n".$GLOBALS["STORED_REPS"][$id]["sql"]);
                    			$refDDLs = Exec_sql($GLOBALS["STORED_REPS"][$key]["sql"], "Get DDL query 20");
                    			while($refDDL = mysqli_fetch_array($refDDLs)){
                    			    $GLOBALS["STORED_REPS"][$key]["result"][$refDDL[0]] = isset($refDDL[1]) ? $refDDL[1] : (isset($refDDL[2]) ? $refDDL[2] : $refDDL[0]);
                    			    $refIn .= ",".$refDDL[0];
                    			}
    						}
    						$GLOBALS["where"] = $GLOBALS["join"] = "";
    						if($refIn !== ""){
        						Construct_WHERE($key, Array("F" => "IN(".substr($refIn, 1).")"), $cur_typ, $key);
        						$GLOBALS["where"] = "$where_bak " . str_replace("a$key.val  IN(", "a$key.id IN(", $GLOBALS["where"]);
        						$GLOBALS["join"] = "$joins_bak " . $GLOBALS["join"];
        					}
    						else{
        						$GLOBALS["where"] = $where_bak;
        						$GLOBALS["join"] = $joins_bak;
        						Construct_WHERE($key, $value, $cur_typ, $key);
    						}
    						unset($GLOBALS["REQREF"]["2"]);
    						$id = $id_bak;   # Restore ID and Block info
						}
						else
    						Construct_WHERE($key, $value, $cur_typ, $key);
					}
				}
#print_r($GLOBALS);die();
			$filter_tables = $GLOBALS["join"];
			$filter_cond .= $GLOBALS["where"];

			if($blocks["&main"]["CUR_VARS"]["parent_obj"]	# In case we have a dependent type
					&& !$f_u)	#  and no parent filter set - cut off meta records
				$filter_tables = " JOIN $z par ON par.id=vals.up AND par.up!=0 $filter_tables ";

			$GLOBALS["REQS"][$cur_typ] = $cur_base_typ; # Add the Object value to the Reqs list
			foreach($GLOBALS["REQS"] as $req => $base)
				if(isset($GLOBALS["GRANTS"]["mask"][$req])){
					foreach($GLOBALS["GRANTS"]["mask"][$req] as $mask => $level){ # Apply all masks
						$GLOBALS["where"] = $GLOBALS["join"] = $GLOBALS["CONDS"] = "";
						Construct_WHERE($req, array("F" => $mask), $cur_typ, $req);
						if(isset($GLOBALS["REF_typs"][$req]))
						    $GLOBALS["where"] = str_replace(".val", ".id", $GLOBALS["where"]);
						if(isset($reqs_granted))
							$reqs_granted .= " OR ".substr($GLOBALS["where"], 4);
						else
							$reqs_granted = substr($GLOBALS["where"], 4);
						if(strpos($filter_tables, "$z a$req") === FALSE) # Is the table joined already?
							$filter_tables .= $GLOBALS["join"];
					}
					$filter_cond .= " AND ($reqs_granted) ";
					unset($reqs_granted);
				}
#print_r($GLOBALS);die($filter_tables."<br>$filter_cond");

			if(!strlen($filter_cond) && isset($_REQUEST["f_show_all"]))
				$filter_cond = " ";
#				$filter_cond = " and vals.id IS NOT NULL"; 
						
			$tmp_base_typ = $cur_base_typ;
			if($GLOBALS["ORDER_VAL"] === "val")
				$order = "vals.val";
			elseif(($GLOBALS["ORDER_VAL"] != 0) && ($GLOBALS["REV_BT"][$GLOBALS["ORDER_VAL"]] != "ARRAY"))
			{
				$tmp_base_typ = $GLOBALS["ORDER_VAL"];
				$order = "a$tmp_base_typ.val";
        		if(isset($GLOBALS["MULTI"][$tmp_base_typ]))
        			$GLOBALS["distinct"] = "DISTINCT"; # Multies might return multiple rows, so we have to remove the dupes
				if(strpos($filter_tables, "a$tmp_base_typ") === FALSE) # We don't have this table in the FROM clause - get it
				{
					if(isset($GLOBALS["REF_typs"][$tmp_base_typ])) // multiple refs to fix
						$filter_tables = " LEFT JOIN ($z r$tmp_base_typ JOIN $z a$tmp_base_typ) "
										." ON r$tmp_base_typ.up=vals.id AND r$tmp_base_typ.t=a$tmp_base_typ.id AND r$tmp_base_typ.val='$tmp_base_typ' "
										." AND a$tmp_base_typ.t=".$GLOBALS["REF_typs"][$tmp_base_typ].$filter_tables;
					else
						$filter_tables = " LEFT JOIN $z a$tmp_base_typ ON a$tmp_base_typ.up=vals.id AND a$tmp_base_typ.t=$tmp_base_typ".$filter_tables;
				}
			}
			else
				$order = "";	# Clean the ORDER clause for potentially vast result sets

			if(!$filter_by_id_off)  # Implement ID filter in case there are no other conditions
				$filter_cond .= $filter_by_id;

			if(strlen($order))
				if(($GLOBALS["REV_BT"][$tmp_base_typ] == "NUMBER") || ($GLOBALS["REV_BT"][$tmp_base_typ] == "SIGNED"))
					$order = "$order + 0.0";  # Convert all numeric values to number

			$desc = $GLOBALS["DESC"];  # Set the Descending order, if required
			$pg = (DEFAULT_LIMIT * ($GLOBALS["PG"] - 1)).",";

			if(($GLOBALS["parent_id"] > 1) && ($GLOBALS["ORDER_VAL"] === 0))
				$order = " ORDER BY vals.ord";  # Arrays are to be sorted by their order by default
			elseif(strlen($order))
				$order = " ORDER BY $order $desc";

			if(isset($_GET["LIMIT"]) && ((int)$_GET["LIMIT"] > 0))
				$order .= " LIMIT $pg ".(int)$_GET["LIMIT"];
			elseif(!isset($_REQUEST["csv"]) && !isset($GLOBALS["dataExport"]))	# Retrieve all data in case of XLS export
				$order .= " LIMIT $pg ".DEFAULT_LIMIT;

			$distinct = $GLOBALS["distinct"];
			# Delete the selection and then retrieve the data again
			if(isset($_REQUEST["_m_del_select"]))
			{
				if(!isset($GLOBALS["GRANTS"]["DELETE"][1]) && !isset($GLOBALS["GRANTS"]["DELETE"][$cur_typ]) && ($GLOBALS["GLOBAL_VARS"]["user"] != "admin") && ($GLOBALS["GLOBAL_VARS"]["user"] != $z))
					die(t9n("[RU]У вас нет прав на массовое удаление объектов этого типа[EN]You do not have access to delete this type of object in bulk"));
				# Don't drop those referenced from somewhere
				$data_set = Exec_sql("SELECT $distinct vals.id FROM $z vals	LEFT JOIN $z refr ON refr.t=vals.id /*AND !length(refr.val)*/ $filter_tables
										WHERE vals.t=$cur_typ AND vals.t!=vals.up $parent_cond $filter_cond AND refr.id IS NULL"
										.($cur_typ == 18 ? " AND vals.id!=".$GLOBALS["GLOBAL_VARS"]["user_id"] : "") // The user cannot delete himself
									, "Get filtered Objs set to delete");
				$deleted = mysqli_num_rows($data_set);
				while($row = mysqli_fetch_array($data_set))
					BatchDelete($row["id"]);
				BatchDelete(""); // Flush batch
				header("Location: /$z/object/$id/?deleted=$deleted&".$GLOBALS["FILTER"]);
				myexit();
			}
			if(isset($_GET["_count"])){
				if($row = mysqli_fetch_array(Exec_sql("SELECT COUNT($distinct vals.id) cnt FROM $z vals $filter_tables
                    									WHERE vals.t=$cur_typ $parent_cond $filter_cond", "Count filtered Objs")))
    			api_dump(json_encode(array("count"=>$row["cnt"]), JSON_UNESCAPED_UNICODE), "count.json");
			}
			$data_set = Exec_sql("SELECT $distinct vals.id, vals.t, vals.val, vals.up, vals.ord val_ord "
			                        ." FROM $z vals $filter_tables WHERE vals.t=$cur_typ AND vals.t!=vals.up $parent_cond $filter_cond $order"
			                    , "Get filtered Objs set");
			$blocks["object_count"] = mysqli_num_rows($data_set);
			$i = 0; # Row count for Array elements
			while($row = mysqli_fetch_array($data_set))
			{
    			if(isset($GLOBALS["dataExport"])){
    				$GLOBALS["dataExport"][] = Export_reqs($id, $row["id"], $row["val"]);
    				#$str = Export_reqs($id, $row["id"], $row["val"]);
    				#fwrite($GLOBALS["CSV_handler"], $str);
#{print($head_str);}#print_r($GLOBALS["data"]);print_r($GLOBALS);die();}
    				continue;
    			}
				if(!isset($_REQUEST["full"]) && (mb_strlen($row["val"]) > VAL_LIM))
					$v = htmlspecialchars(mb_substr($row["val"], 0, VAL_LIM)) . "...";
				else
					$v = htmlspecialchars($row["val"]);

    			if(isApi()){
    			    if(isset($_REQUEST["JSON_DATA"]))
        				$GLOBALS["GLOBAL_VARS"]["newapi"][$row["id"]] = "{\"i\":".$row["id"].",\"u\":".$row["up"].",\"o\":".$row["val_ord"].",\"r\":[\"".addcslashes($row["val"], "\\\"")."\"";
    			    else{
        				if($f_u > 1)  # Fetch the order
                		    $GLOBALS["GLOBAL_VARS"]["api"]["object"][$i]["ord"] = $row["val_ord"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["object"][$i]["id"] = $row["id"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["object"][$i]["up"] = $row["up"];
            		    $GLOBALS["GLOBAL_VARS"]["api"]["object"][$i]["val"] = Format_Val_View($cur_base_typ, $v, $row["id"]);
                        if(in_array($GLOBALS["REV_BT"][$cur_base_typ], array("REPORT_COLUMN", "GRANT")))
                		    $GLOBALS["GLOBAL_VARS"]["api"]["object"][$i]["ref"] = $v;
            		    $GLOBALS["GLOBAL_VARS"]["api"]["object"][$i]["base"] = $row["t"];
    			    }
            		$i++;
    			}

				$blocks[$block]["id"][] = $row["id"];
				$blocks[$block]["ord"][] = $i;
				$blocks[$block]["align"][] = Get_Align($cur_base_typ);
				if(trim($v) == "")	# In case no chars except spaces, make it a single space to let the A-tag work
					$v = "&nbsp;";
				if(isset($GLOBALS["dataExport"]))	# Export data AS IS
					$blocks[$block]["val"][] = $row["val"];
				else
					$blocks[$block]["val"][] = Format_Val_View($cur_base_typ, $v, $row["id"]);
				if($f_u > 1)  # Fetch the order
					$blocks[$block]["val_ord"][] = $row["val_ord"];
			}
			if(isset($GLOBALS["dataExport"]) || isApi())
			    break;
			if((($blocks["object_count"] == DEFAULT_LIMIT)  # There could be more results beyond the DEFAULT_LIMIT
					|| ($GLOBALS["PG"] > 1))	# The last page has less than DEFAULT_LIMIT rows
				&& strlen($filter_cond))
			{
				if(strlen($filter_tables))
				{
					if($row = mysqli_fetch_array(Exec_sql("SELECT COUNT($distinct vals.id) cnt FROM $z vals $filter_tables
									WHERE vals.t=$cur_typ $parent_cond $filter_cond", "Get number of filtered Objs")))
						$blocks["object_count_total"] = $row["cnt"];
				}
				else
				{
					#$row = mysqli_fetch_array(Exec_sql("SELECT COUNT(1) cnt FROM $z vals WHERE t=$cur_typ $filter_cond AND up!=0", "Get number of Objs"));
					$row = mysqli_fetch_array(Exec_sql("SELECT COUNT(1)-(SELECT COUNT(1) cnt FROM $z vals WHERE t=$cur_typ AND up=0) cnt FROM $z vals WHERE t=$cur_typ $filter_cond", "Get number of Objs"));
					#$n = $row["cnt"];
					#$row = mysqli_fetch_array(Exec_sql("SELECT COUNT(1) cnt FROM $z vals WHERE t=$cur_typ AND up=0", "Get number of metas"));
					#$blocks["object_count_total"] = $n - $row["cnt"];
					$blocks["object_count_total"] = $row["cnt"];
				}
			}
			elseif(strlen($filter_cond))
				$blocks["object_count_total"] = $blocks["object_count"];
#print_r($blocks);die();
			break;

		case "&head_ord":
		case "&head_ord_n":
#		case "&head_move_n_delete":
			if($f_u > 1)
				$blocks[$block]["filler"][] = "";
			break;

		case "&move_n_delete":
			if($f_u > 1)
				$blocks[$block]["id"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["id"];
			break;

		case "&ord":
			if($f_u > 1)
				$blocks[$block]["ord"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val_ord"];
			break;

		case "&move":  # Hide movers in case of sorting (original order's not adequate)
			if(($f_u > 1) && ($GLOBALS["ORDER_VAL"] == 0))
				$blocks[$block]["id"][] = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["id"];
			break;
			
		case "&no_page": # Inform of the non-complete resultset
			if(!isset($blocks["object_count_total"]) && ($blocks["object_count"] == DEFAULT_LIMIT)){
				$blocks[$block]["limit"][] = DEFAULT_LIMIT;
				$blocks[$block]["id"][] = $id;
				$blocks[$block]["f_u"][] = $f_u;
				$blocks[$block]["lnx"][] = (isset($_REQUEST["lnx"]) ? "&lnx=".(int)$_REQUEST["lnx"] : "")
				                            .($GLOBALS["ORDER_VAL"] === 0 ? "" : "&order_val=".$GLOBALS["ORDER_VAL"]);
			}
			break;

		case "&uni_obj_pages":
			if(isset($_REQUEST["csv"])){
				fclose($GLOBALS["CSV_handler"]);
				echo ob_get_clean();
				die();
			}
			elseif(isset($GLOBALS["dataExport"])){
				download_send_headers("data_export.bki");
				ob_start();
				$GLOBALS["CSV_handler"] = fopen("php://output", 'w');
				fwrite($GLOBALS["CSV_handler"], exportHeader());
				fwrite($GLOBALS["CSV_handler"], "DATA\r\n".implode($GLOBALS["dataExport"]));
				fclose($GLOBALS["CSV_handler"]);
				echo ob_get_clean();
			}
			if(isset($_GET["saved1"]))
				$blocks[$block]["ending"][] = t9n("[RU]Эта запись сохранена.[EN]This record saved.");
			elseif(isset($_GET["copied1"]))
				$blocks[$block]["ending"][] = t9n("[RU]Эта запись скопирована.[EN]This record copied.");
			elseif(isset($_GET["canc1"]))
				$blocks[$block]["ending"][] = t9n("[RU]Эта запись не изменена.[EN]This record not changed.");
			elseif(isset($_GET["deleted"]))
				$blocks[$block]["ending"][] = t9n("[RU]Удалено [EN]Deleted ").(int)$_GET["deleted"];
			elseif(isset($blocks["object_count_total"])){
				$pages = ceil($blocks["object_count_total"] / DEFAULT_LIMIT);
				$blocks[$block]["val"][] = $blocks["object_count_total"];
				$blocks[$block]["pages"][] = $pages;

				$last_dig = $blocks["object_count_total"]%10;
				if(($last_dig >= 5) || ($last_dig == 0))  # Set the proper ending
					$records = t9n("[RU]записей[EN]records");
				elseif($blocks["object_count_total"] == 1)
					$records = t9n("[RU]запись[EN]record");
				elseif(($blocks["object_count_total"]%100 > 14) || ($blocks["object_count_total"]%100 < 5)){
					if($last_dig == 1)	# %1, %21, %31...
						$records = t9n("[RU]запись[EN]records");
					else	# %2, %3, %4
						$records = t9n("[RU]записи[EN]records");
				}
				else	# %11, %12, %13, %14
					$records = t9n("[RU]записей[EN]records");
				
				$blocks[$block]["ending"][] = t9n("[RU]Всего [EN]Total ").$blocks["object_count_total"]." $records.";
			}
			break;
			
		case "&page": # Construct the Pages navigation bar
			if($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["pages"] > 1){
				if($GLOBALS["PG"] != 1)  # Link to the Previous page
				{
					$blocks[$block]["page"][] = $GLOBALS["PG"] - 1;
					$blocks[$block]["val"][] = " < ";
					$blocks[$block]["class"][] = "";
				}
					
				$pages = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["pages"];
				$i = 1;
				while($i <= $pages) # List available pages
				{
					if($i == $GLOBALS["PG"])  # Current page's link is inactive
						$blocks[$block]["class"][] = "active";
					else
						$blocks[$block]["class"][] = "";
					$blocks[$block]["page"][] = $i; # Page number
					$blocks[$block]["val"][] = $i++; # Page link appearance ("..." for the gap between pages)
					
					if(($i > 3) && ($i < $pages - 2))  # Show first 5 and last 5 pages
						if(abs($i - $GLOBALS["PG"]) > 1) # also show three pages nearest to the current one
						{
							$blocks[$block]["val"][] = ".&nbsp;.&nbsp;."; # Link to the middle of the gap
							$blocks[$block]["class"][] = "";
							if($i < $GLOBALS["PG"])
							{
								$i = $GLOBALS["PG"] - 1;
								$blocks[$block]["page"][] = round((3 + $i) / 2);
							}
							else
							{
								$blocks[$block]["page"][] = round(($pages - 2 + $i) / 2);
								$i = $pages - 2;
							}
						}
				}
				if($GLOBALS["PG"] != $pages)  # Link to the Next page 
				{
					$blocks[$block]["page"][] = $GLOBALS["PG"] + 1;
					$blocks[$block]["val"][] = " > ";
					$blocks[$block]["class"][] = "";
				}
				if(isApi())
			        $GLOBALS["GLOBAL_VARS"]["api"]["pages"] = $blocks[$block]["val"];
			}
			break;

		case "&page_href":
			if($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"] != $GLOBALS["PG"]){
				$blocks[$block]["filter"][] = $GLOBALS["FILTER"].(isset($_REQUEST["lnx"]) ? "&lnx=".(int)$_REQUEST["lnx"] : "")
											.($GLOBALS["ORDER_VAL"] === 0 ? "" : "&order_val=".$GLOBALS["ORDER_VAL"]
												.(isset($_REQUEST["desc"]) ? "&desc=1" : ""));
#print_r($GLOBALS);die();
				$blocks[$block]["id"][] = $id;
			}
			break;

		case "&multiselectcell":
		    $typ = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["typ"];
		    if(isset($blocks["multiselectcell"][$typ])){
				$literal_typ = $GLOBALS["REV_BT"][$typ];
				$base_typ = isset($GLOBALS["BT"][$literal_typ]) ? $GLOBALS["BT"][$literal_typ] : $GLOBALS["BT"]["SHORT"];
    	        foreach($blocks["multiselectcell"][$typ]["id"] as $k => $v){
        		    $blocks[$block]["id"][] = $blocks["multiselectcell"][$typ]["id"][$k];
        		    $blocks[$block]["ord"][] = $blocks["multiselectcell"][$typ]["ord"][$k];
        		    $blocks[$block]["val"][] = $blocks["multiselectcell"][$typ]["ref_id"][$k];
        		    $v = Format_Val_View($base_typ, htmlspecialchars($blocks["multiselectcell"][$typ]["val"][$k]));
        		    if(Grant_1level($typ))
            		    $blocks[$block]["name"][] = "<A HREF=\"/$z/object/".$GLOBALS["REF_typs"][$typ]."/?F_I=".$blocks["multiselectcell"][$typ]["ref_id"][$k]."\" class=\"ms-link\">$v</A>";
            		else
            		    $blocks[$block]["name"][] = $v;
    	        }
    	        unset($blocks["multiselectcell"][$typ]);
            }
			break;
			
		case "&uni_object_view_reqs":
			$parent_id = $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["id"];
			if($GLOBALS["no_reqs"])  # Return in case there's no Reqs
			{
				if(isset($_REQUEST["csv"]))	# Export the first column
					fputcsv($GLOBALS["CSV_handler"], array(iconv("utf-8", "windows-1251", $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"])), ';');
			    if(isset($_REQUEST["JSON_DATA"]))
				    $GLOBALS["GLOBAL_VARS"]["newapi"][$parent_id] .= "]}";
				break;
			}
			if($GLOBALS["lnx"] == 1)
				$flags = "&lnx=1";
			else
				$flags = "";
			if(isset($GLOBALS["HAVE_ARR"]))
				$sql = "SELECT CASE WHEN typs.up=0 THEN 0 ELSE reqs.id END id, CASE WHEN typs.up=0 THEN 0 ELSE reqs.val END val
							, typs.t ref, reqs.ord, typs.id t, typs.up, typs.val refr, count(1) arr_num";
			else
				$sql = "SELECT reqs.id, reqs.val, typs.t ref, typs.id t, typs.up, typs.val refr, reqs.ord";
			$sql .= " FROM $z reqs JOIN $z typs ON typs.id=reqs.t WHERE reqs.up=$parent_id";
			if(isset($GLOBALS["HAVE_ARR"]))
				$sql .=	" GROUP BY val, id, t, refr";
			$data_set = Exec_sql($sql, "Get all Object reqs");

			while($row = mysqli_fetch_array($data_set))
				if(isset($GLOBALS["NonREF_typs"][$row["t"]])){
					$rows[$row["t"]]["id"] = $row["id"];
					$rows[$row["t"]]["val"] = $row["val"];
					$rows[$row["t"]]["arr_num"] = isset($row["arr_num"]) ? $row["arr_num"] : "";
				}
				else{ # It is a Reference
				    $ref_id = $row["ref"];
				    $ref = $row["val"];
					$rows[$ref]["id"][] = $row["id"];
    				# Check if we got a query for the DDL
					if(isset($GLOBALS["STORED_REPS"][$ref]["ddl"])){
#						trace("We got a query for the ".$row["id"]." -> ".$row["ref_id"]." DDL (".$GLOBALS["STORED_REPS"][$ref]["ddl"].") $id\r\n".$GLOBALS["STORED_REPS"][$id]["sql"]);
						$id_bak = $id;
						if(!isset($GLOBALS["STORED_REPS"][$id]["sql"])){
    						$id = Get_block_data($GLOBALS["STORED_REPS"][$ref]["ddl"], FALSE, TRUE); # Prepare the query
    						if($GLOBALS["STORED_REPS"][$id]["sql"])
    						    $GLOBALS["STORED_REPS"][$ref]["sql"] = $GLOBALS["STORED_REPS"][$id]["sql"];
    						else
    						    $GLOBALS["STORED_REPS"][$id]["sql"] = FALSE; # Failed to get the report
    					}
    					if($GLOBALS["STORED_REPS"][$id]["sql"]){
    					    trace(" ddl rep here for ".$ref." -> ".$row["refr"]." check id #".$row["t"]);
    					    if(!isset($GLOBALS["STORED_REPS"][$ref]["result"])){
                    			$refDDLs = Exec_sql($GLOBALS["STORED_REPS"][$ref]["sql"], "Get DDL query 20");
                    			while($refDDL = mysqli_fetch_array($refDDLs, MYSQLI_NUM)){
                    			    $GLOBALS["STORED_REPS"][$ref]["result"][$refDDL[0]] = isset($refDDL[1]) ? $refDDL[1] : $refDDL[0];
        							trace("  refDDL ".$row["t"]." ".implode(",", $refDDL)); 
                    			}
    					    }
    					    if(isset($GLOBALS["STORED_REPS"][$ref]["result"][$row["t"]]))
            					$row["refr"] = $GLOBALS["STORED_REPS"][$ref]["result"][$row["t"]];
            				else{
            				    $sql = str_replace("$ref_id.t=$ref_id", "$ref_id.id=".$row["t"], $GLOBALS["STORED_REPS"][$ref]["sql"]);
        					    trace(" $sql");
                    			if($refDDL = mysqli_fetch_array(Exec_sql($sql, "Get DDL query"), MYSQLI_NUM)){
                					$row["refr"] = isset($refDDL[1]) ? $refDDL[1] : $refDDL[0];
        							trace("  refDDL one".implode(",", $refDDL));
                    			}
            				}
						}
						$id = $id_bak;   # Restore ID and Block info
					}
					$rows[$ref]["val"][] = $row["refr"];
					$rows[$ref]["ord"][] = $row["ord"];
					$rows[$ref]["ref_id"][] = $row["t"];
				}
			foreach($GLOBALS["REQS"] as $key => $value){
#print_r($GLOBALS);print_r($rows);die();
				if(($key == $id) && !isset($GLOBALS["ARR_typs"][$key]))	# The last Req is the object itself
					break;
				if(isset($rows[$key]))
					$row = $rows[$key];
				else
					$row = array("t" => $key);
				if(isset($GLOBALS["GRANTS"][$key])) # Skip barred Reqs - hide them
					if($GLOBALS["GRANTS"][$key] == "BARRED")
						continue;
				$val = isset($row["val"]) ? $row["val"] : "";
				$literal_typ = $GLOBALS["REV_BT"][$key];
				$base_typ = isset($GLOBALS["BT"][$literal_typ]) ? $GLOBALS["BT"][$literal_typ] : $GLOBALS["BT"]["SHORT"];
                $blocks[$block]["typ"][] = $key;
                
				$req_id = isset($row["id"]) ? $row["id"] : 0;
				if(isApi()){
					if(isset($GLOBALS["ARR_typs"][$key])) # Array of linked values
						$v = isset($row["arr_num"]) ? (int)$row["arr_num"] : "";
					elseif(isset($row["ref_id"])){  # Reference
						$v = str_replace(",", "&comma;", $row["val"]);
						$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$parent_id]["ref_$key"] = $GLOBALS["REF_typs"][$key].":".(is_array($row["ref_id"])?implode(",", $row["ref_id"]) : $row["ref_id"]);
					}
					elseif($req_id > 0){ # We got some value
						if($GLOBALS["REV_BT"][$base_typ] == "FILE")
							$v = Format_Val_View($base_typ, $req_id.":".$val, $req_id);
						else
							$v = Format_Val_View($base_typ, $val);
					}
					elseif($literal_typ == "BUTTON")
						$v = "***";
					else
					    $v = $val;
    			    if($v != ""){
					    $v = is_array($v) ? implode(",", $v) : $v;
    					$GLOBALS["GLOBAL_VARS"]["api"]["reqs"][$parent_id][$key] = $v;
    			    }
    			    if(isset($_REQUEST["JSON_DATA"])){
    			        $v = str_replace("\"", "\\\"", $v);
    					if(isset($row["ref_id"]))  # Reference
        				    $GLOBALS["GLOBAL_VARS"]["newapi"][$parent_id] .= ",\"".(is_array($row["ref_id"]) ? implode(",", $row["ref_id"]) : $row["ref_id"]).":$v\"";
        				else
        				    $GLOBALS["GLOBAL_VARS"]["newapi"][$parent_id] .= ",\"$v\"";
    			    }
    			}
				if(isset($_REQUEST["csv"])){
					if(isset($GLOBALS["ARR_typs"][$key])) # Array of linked values
						$blocks[$block]["val"][] = isset($row["arr_num"]) ? (int)$row["arr_num"] : "";
					elseif(isset($row["ref_id"]))  # Reference
						$blocks[$block]["val"][] = isset($GLOBALS["MULTI"][$key]) || (count($val) > 1) ? implode(",", str_replace(",", "%2C", $row["val"])) : array_shift($val);
					elseif($req_id > 0){ # We got some value
						if($GLOBALS["REV_BT"][$base_typ] == "FILE")
							$blocks[$block]["val"][] = Format_Val_View($base_typ, $val, $req_id);
						else
							$blocks[$block]["val"][] = Format_Val_View($base_typ, $val);
					}
					elseif($literal_typ == "BUTTON")
						$blocks[$block]["val"][] = "***";
					else
						$blocks[$block]["val"][] = "";
				}
				else{
					$blocks[$block]["align"][] = Get_Align($base_typ);
					$blocks[$block]["base"][] = $GLOBALS["REV_BT"][$base_typ];
					if(isset($GLOBALS["ARR_typs"][$key])) # Array of linked values
						$blocks[$block]["val"][] = "<A HREF=\"/$z/object/$key/?F_U=$parent_id$flags\">(".(isset($row["arr_num"])?(int)$row["arr_num"]:0).")</A>";
					elseif(isset($row["ref_id"])){  # Reference
            		    if(isset($GLOBALS["MULTI"][$key]) || (count($val) > 1)){
            		        $blocks[$block]["val"][] = "";
            		        $blocks["multiselectcell"][$key] = $row;
            		    }
						elseif(Grant_1level($key)) # Do we have access to this Type
							$blocks[$block]["val"][] = "<A HREF=\"/$z/object/".$GLOBALS["REF_typs"][$key]."/?F_I=".$row["ref_id"][0]."$flags\">".Format_Val_View($base_typ, htmlspecialchars($val[0]))."</A>";
						else
							$blocks[$block]["val"][] = Format_Val_View($base_typ, htmlspecialchars($val[0]));
					}
					elseif($req_id > 0){ # We got some value
						if($GLOBALS["REV_BT"][$base_typ] == "FILE")
							$blocks[$block]["val"][] = Format_Val_View($base_typ, $val, $req_id);
						elseif(!isset($_REQUEST["full"]) && (mb_strlen($val) > VAL_LIM))
        					$blocks[$block]["val"][] = Format_Val_View($base_typ, htmlspecialchars(mb_substr($val, 0, VAL_LIM))) . "...";
						else
							$blocks[$block]["val"][] = Format_Val_View($base_typ, htmlspecialchars($val));
					}
					elseif($literal_typ == "BUTTON"){
					    $tmp = removeMasks($GLOBALS["attrs"][$key]);
						$blocks[$block]["val"][] = " <A HREF=\"/$z/".str_replace("[ID]", $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["id"]
														, str_replace("[VAL]", $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]
																		, $tmp))."\">***</A>";
					}
					else
						$blocks[$block]["val"][] = "";
				}
			}
			if(isApi())
			    if(isset($_REQUEST["JSON_DATA"]))
				    $GLOBALS["GLOBAL_VARS"]["newapi"][$parent_id] .= "]}";
				else
    				$GLOBALS["GLOBAL_VARS"]["api"]["&object_reqs"][$parent_id] = $blocks[$block]["val"];
#if($parent_id == 227)
#{print_r($GLOBALS);print_r($rows);print_r($blocks[$block]);die();}
			if(isset($_REQUEST["csv"]))
			{	# First add the first column
				array_unshift($blocks[$block]["val"], $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"]);
				foreach ($blocks[$block]["val"] as $key => $value)
					$blocks[$block]["val"][$key] = iconv("utf-8", "windows-1251", $value);
				fputcsv($GLOBALS["CSV_handler"], $blocks[$block]["val"], ';');
				unset($blocks[$block]["val"]);
			}
			break;

		case "&reqs_links":
			if($GLOBALS["lnx"] == 1)
				foreach($GLOBALS["links"] as $key => $value)
					if(Check_Grant($value, $key, "READ", FALSE))
					{
						$blocks[$block]["value"][] = $value;
						$blocks[$block]["links_typ"][] = $key;
						$blocks[$block]["key"][] = $GLOBALS["links_val"][$key];
					}
			break;
			
		case "&buttons":
			if(isset($blocks["BUTTONS"]))
				foreach($blocks["BUTTONS"] as $key => $value)
				{
				    $value = removeMasks($value);
					$blocks[$block]["val"][] = $key;
					$blocks[$block]["attrs"][] = str_replace("[ID]", $GLOBALS["cur_id"]
														, str_replace("[VAL]", $blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["val"], $value));
				}
			break;

		case "&uni_report":
			if(!isset($GLOBALS["STORED_REPS"][$id]["header"]))
				if(Check_Grant($id, 0, "READ"))
					Compile_Report($id, $block, TRUE, TRUE);
			$blocks[$block]["val"][] = $GLOBALS["STORED_REPS"][$id]["header"];
			break;

		case "&uni_report_head":
			if(isset($GLOBALS["STORED_REPS"][$id]["head"]))
				foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
					if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # Not a hidden column
						$blocks[$block]["val"][] = $GLOBALS["STORED_REPS"][$id]["head"][$key];
#if($block="mybar")
#{print_r($blocks[$block]);}
			break;

		case "&uni_report_filter":
			if(isset($GLOBALS["STORED_REPS"][$id]["head"]))
			{
				foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
					if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key]) # Not a hidden column
					    && isset($GLOBALS["STORED_REPS"][$id]["types"][$key])) # and not the Execute link
					{	
					    $value=str_replace(" ", "_", $value);
					    $blocks[$block]["col"][] = $value;
						$blocks[$block]["fr_val"][] = isset($_REQUEST["FR_$value"]) ? (strlen($_REQUEST["FR_$value"]) ? $_REQUEST["FR_$value"] 
                            : (isset($GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$key]) ? $GLOBALS["STORED_REPS"][$id][REP_COL_FROM][$key] : "")) : "";
						$blocks[$block]["to_val"][] = isset($_REQUEST["TO_$value"]) ? (strlen($_REQUEST["TO_$value"]) ? $_REQUEST["TO_$value"]
    					    : (isset($GLOBALS["STORED_REPS"][$id][REP_COL_TO][$key]) ? $GLOBALS["STORED_REPS"][$id][REP_COL_TO][$key] : "")) : "";
					}
			}
#{print_r($GLOBALS);die($id);}
			break;

		case "&uni_report_data":
			if($GLOBALS["STORED_REPS"][$id]["rownum"])
				$blocks[$block]["data"] = array_fill(0, $GLOBALS["STORED_REPS"][$id]["rownum"], "");
#{print_r($GLOBALS);die($id);}
			break;

		case "&uni_report_column":
#print_r($GLOBALS["STORED_REPS"][$id]["names"]);die();
			foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
			{
#				$blocks[$block]["rowspan"][] = "1";
				if(isset($GLOBALS["STORED_REPS"][$id]["base_out"][$key]))
    				$blocks[$block]["align"][] = Get_Align($GLOBALS["BT"][$GLOBALS["STORED_REPS"][$id]["base_out"][$key]]);
    			else
    				$blocks[$block]["align"][] = "LEFT";
				$blocks[$block]["val"][] = array_shift($blocks["_data_col"][$id][$GLOBALS["STORED_REPS"][$id]["names"][$key]]);
			}
			break;

		case "&uni_report_totals":
			if(isset($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL]))
				if(strlen(implode($GLOBALS["STORED_REPS"][$id][REP_COL_TOTAL])))	# Any totals?
					$blocks[$block]["totals"][] = "";
			break;

		case "&uni_report_column_total":
#print_r($blocks);print_r($GLOBALS); die();
			if(isset($blocks["col_totals"][$id]))
				foreach($blocks["col_totals"][$id] as $key => $value)
					$blocks[$block]["val"][] = $value."&nbsp";
			break;

		case "&login":
			#$blocks[$block]["save"][] = isset($_POST["save"]) ? "CHECKED" : "";
			$blocks[$block]["change"][] = isset($_POST["change"]) ? "CHECKED" : "";
#print_r($GLOBALS); die();
			break;

		case "&dir_admin":
            $grant = RepoGrant();
            if($grant == "BARRED")
            	die(t9n("[RU]Недостаточно прав для доступа к этому рабочему месту[EN]Insufficient permissions to access this workplace"));
			$blocks[$block]["folder"][] = isset($_REQUEST["download"]) ? "download" : "templates";
			$blocks[$block]["another"][] = isset($_REQUEST["download"]) ? "templates" : "download";
			if($blocks[$block]["folder"][0] == "download")
				$path = "download/$z";
			else
				$path = "templates/custom/$z";
			if(!file_exists($path))
				mkdir($path);
			$add_path = isset($_REQUEST["add_path"]) ? $_REQUEST["add_path"] : "";
			if(strpos($add_path, "..") !== false)
            	$add_path = "";
			if(isset($_REQUEST["gf"]))
				if((strpos($_REQUEST["gf"], "..") === false) && file_exists($path.$add_path."/".$_REQUEST["gf"]))
				{
					$file = $path.$add_path."/".$_REQUEST["gf"];
					if (ob_get_level())
					  ob_end_clean();
					header('Content-Description: File Transfer');
					header('Content-Type: application/octet-stream');
					header('Content-Disposition: attachment; filename=' . basename($file));
					header('Content-Transfer-Encoding: binary');
					header('Expires: 0');
					header('Cache-Control: must-revalidate');
					header('Pragma: public');
					header('Content-Length: ' . filesize($file));
					readfile($file);
					exit;
				}
				else
				    die(t9n("[RU]Файл не найден[EN]File not found"));
			if(is_dir($path.$add_path))
				$path .= $add_path;
			else
				$add_path = "";
			$blocks[$block]["path"][] = $path;
			$blocks[$block]["add_path"][] = $add_path;
			$fname = isset($_REQUEST["dir_name"])?strtolower(trim($_REQUEST["dir_name"])):"";
			if(isset($_REQUEST["mkdir"]))
			{
			    if($grant != "WRITE")
                	die(t9n("[RU]Недостаточно прав для создания каталогов[EN]Insufficient permissions to create directories"));
				check();
				if(preg_match(DIR_MASK, $fname))
				{
					if(is_dir($path."/".$fname))
						die(t9n("[RU]Такой каталог уже существует![EN]This directory already exists!".BACK_LINK));
					mkdir($path."/".$fname);
					header("Location: /$z/dir_admin/?".$blocks[$block]["folder"][0]."=1&add_path=$add_path");
					myexit();
				}
				else
					die(t9n("[RU]Недопустимое имя каталога.[EN]The directory name is invalid".BACK_LINK));
			}
			if(isset($_REQUEST["touch"]))
			{
			    if($grant != "WRITE")
                	die(t9n("[RU]Недостаточно прав для создания файлов[EN]Insufficient permissions to create files"));
				check();
				if(preg_match(FILE_MASK, $fname))
				{
                    BlackList(substr(strrchr($fname, '.'), 1)); # Check the file extension
                    if(strpos($fname,".") === false)
                        $fname .= ".html";
                    if(is_file($path."/".$fname))
						die(t9n("[RU]Такой файл ($fname) уже существует![EN]File ($fname) already exists!".BACK_LINK));
					touch($path."/".$fname);
					header("Location: /$z/dir_admin/?".$blocks[$block]["folder"][0]."=1&add_path=$add_path");
					myexit();
				}
				else
					die(t9n("[RU]Недопустимое имя файла.[EN]Invalid file name".BACK_LINK));
			}
			$warning = "";
			# File upload
			if(isset($_POST["upload"]))
			    if($grant != "WRITE")
                	die(t9n("[RU]Недостаточно прав для загрузки файлов[EN]No grants to upload files"));
                else
				{
					check();
    			    trace("upload - file ".$value["name"]);
					foreach($_FILES as $value){
        			    trace("upload ".$value["name"]);
						if(strlen($value["name"]) > 0)
						{
            			    trace("upload ".$value["name"]);
							BlackList(substr(strrchr($value["name"], '.'), 1)); # Check the file extension
							if(file_exists($path."/".$value["name"]))
								if(isset($_REQUEST["rewrite"]))
									$warning = t9n("[RU] (перезаписан)[EN] (rewritten)");
								else
									die(t9n("[RU]Такой файл (".$value["name"].") уже существует![EN]File (".$value["name"].") already exists!".BACK_LINK));
							if(!move_uploaded_file($value['tmp_name'], $path."/".$value["name"]))
								die (t9n("[RU]Не удалось загрузить файл[EN]File uploading failed"));
							$warning = t9n("[RU]Файл [EN]File ").$value["name"].t9n("[RU] загружен[EN] uploaded").$warning;
							header("Location: /$z/dir_admin/?".$blocks[$block]["folder"][0]."=1&add_path=$add_path&warning=$warning");
							myexit();
						}
					}
				}
			# Delete files and folders
			if(isset($_POST["delete"]))
			{
			    if($grant != "WRITE")
                	die(t9n("[RU]Недостаточно прав для удаления файлов[EN]Insufficient permissions to delete files"));
				check();
				if(is_array($_POST["del"]))
					foreach($_POST["del"] as $value)
						if(strlen($value))
							RemoveDir($path."/".$value);
#print_r($GLOBALS); die("is_dir($path./.$value) =".is_dir($path."/".$value));
				header("Location: /$z/dir_admin/?".$blocks[$block]["folder"][0]."=1&add_path=$add_path");
				myexit();
			}
			# Make the directories and files list for the current folder
			if($dir = @opendir($path))
			{
				$GLOBALS["dir_list"] = $GLOBALS["file_list"] = $GLOBALS["file_size"] = $GLOBALS["file_time"] = array();
				while(($file = readdir($dir)) !== false)
					if($file != '..' && $file != '.')
					{
						if(is_dir($path."/".$file))
							$GLOBALS["dir_list"][] = $file;
						else
							$GLOBALS["file_list"][] = $file;
					}
				closedir($dir);
				sort($GLOBALS["dir_list"]);
				sort($GLOBALS["file_list"]);
				$blocks[$block]["files"][] = count($GLOBALS["file_list"]);
				$blocks[$block]["folders"][] = count($GLOBALS["dir_list"]);
				foreach($GLOBALS["file_list"] as $value)
				{
					$GLOBALS["file_size"][] = NormalSize(filesize($path."/".$value));
					$GLOBALS["file_time"][] = date ("d.m.Y H:i:s", filemtime($path."/".$value));
				}
			}
			break;
			
		case "&pattern":
			$add_path = "";
			foreach(explode("/", substr($blocks[$blocks[$block]["PARENT"]]["CUR_VARS"]["add_path"], 1)) as $val)
			{
				$add_path .= "/$val";
				$blocks[$block]["path"][] = $add_path;
				$blocks[$block]["name"][] = $val;
			}
			break;

		case "&file_list":
			$blocks[$block]["size"] = $GLOBALS["file_size"];
			$blocks[$block]["time"] = $GLOBALS["file_time"];
			$blocks[$block]["name"] = $GLOBALS["file_list"];
			break;

		case "&dir_list":
			$blocks[$block]["name"] = $GLOBALS["dir_list"];
#print_r($GLOBALS);
			break;

		case "&settings":
			$sql = "SELECT sets.id, typ.val type, val.val settings FROM $z sets JOIN $z typ ON typ.up=sets.id AND typ.t=".SETTINGS_TYPE
                    ." LEFT JOIN $z val ON val.up=sets.id AND val.t=".SETTINGS_VAL
                    ." WHERE sets.val='".$GLOBALS["GLOBAL_VARS"]["user"]."' AND typ.val LIKE 'UI%'";
			$data_set = Exec_sql($sql, "Get user settings");
			while($row = mysqli_fetch_array($data_set)){
				$blocks[$block]["id"][] = $row["id"];
				$blocks[$block]["type"][] = $row["type"];
				$blocks[$block]["settings"][] = $row["settings"];
			}
			break;

		default:
			$rep_id = 0;	# Get Report ID to fetch the data
			if(isset($GLOBALS["STORED_REPS"][$block]["_rep_id"]))
				$rep_id = $GLOBALS["STORED_REPS"][$block]["_rep_id"];
			elseif($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE val='".addslashes($block_name)."' AND t=".REPORT, "Get Report's ID")))
				$rep_id = $row[0]; # Save Report ID
			elseif(is_numeric($block_name) && ($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE id='$block_name' AND t=".REPORT, "Check Report's ID"))))
				$rep_id = $block_name; # Save the direct Report ID

			$GLOBALS["STORED_REPS"][$block]["_rep_id"] = $rep_id;	# No report found

			if($rep_id)	# If we got a Report
			{
				Compile_Report($rep_id, $block, $exe, FALSE, $noFilters);
				if(!$exe)
					return $rep_id;
				$bak_id = $id;
				$id = $rep_id;
				if(isset($_REQUEST["obj"]) && ($_REQUEST["obj"] != 0))
					$obj = $_REQUEST["obj"];

				$id = $rep_id;
				Get_block_data("&uni_report");
				Get_block_data("&uni_report_head");
				Get_block_data("&uni_report_data");
#{print_r($GLOBALS); die($id);}
				if(isset($blocks["_data_col"][$id]) && isset($GLOBALS["STORED_REPS"][$id]["head"]))
					foreach($GLOBALS["STORED_REPS"][$id]["head"] as $key => $value)
						if(!isset($GLOBALS["STORED_REPS"][$id][REP_COL_HIDE][$key])) # Not hidden field
    					    if($GLOBALS["STORED_REPS"][$id]["base_out"][$key] == "HTML")
    						    $blocks[$block][strtolower($value)] = array_shift($blocks["_data_col"][$id]);
    						else
        						$blocks[$block][strtolower($value)] = str_replace("\n", "<BR/>", array_shift($blocks["_data_col"][$id]));

#print_r($GLOBALS);die($block."!");
				$id = $bak_id;
			}
			break;
	}
}
# Check grant to the repository
function RepoGrant()
{
	global $z;
    if(isset($GLOBALS["GRANTS"][$GLOBALS["BT"]["FILE"]])) # The grant is set explicitly
        return $GLOBALS["GRANTS"][$GLOBALS["BT"]["FILE"]];
	elseif(($z == $GLOBALS["GLOBAL_VARS"]["user"]) || ($GLOBALS["GLOBAL_VARS"]["user"] == "admin"))
        return "WRITE"; # We are the admin
    return "BARRED";
}
# Fetch the object's meta data and Reqs
function GetObjectReqs($typ, $id)
{
	global $z;
	$GLOBALS["REQS"] = Array();
	$sql = "SELECT a.id t, refs.id ref_id, a.val attrs, a.ord
				, CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END base_typ
				, CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END val
				, CASE WHEN arrs.id IS NULL THEN NULL ELSE typs.id END arr_id
				, CASE WHEN refs.id IS NULL THEN '' ELSE (SELECT reqbase.id FROM $z refreq, $z reqdef, $z reqbase
				        WHERE refreq.up=refs.id AND reqdef.id=refreq.t AND reqbase.id=reqdef.t  AND reqbase.t!=reqbase.id ORDER BY refreq.ord LIMIT 1) END restr
			FROM $z a, $z typs LEFT JOIN $z refs ON refs.id=typs.t AND refs.t!=refs.id
					LEFT JOIN $z arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
			WHERE a.up=$typ AND typs.id=a.t ORDER BY a.ord";
	$data_set = Exec_sql($sql, "Get the Reqs meta");
	while($row = mysqli_fetch_array($data_set))
	{
		if($row["ref_id"]){
			$GLOBALS["REF_typs"][$row["t"]] = $row["ref_id"];
    		if(strpos($row["attrs"], MULTI_MASK) !== FALSE)
    			$GLOBALS["MULTI"][$row["t"]] = $row["ref_id"];
		}
		elseif($row["arr_id"])
			$GLOBALS["ARR_typs"][$row["t"]] = $row["arr_id"];
		if(($row["base_typ"] == 0) && !isset($_REQUEST["copybtn"]) && !isApi()){	# Tab met and we're not copying the Object
			if(count($GLOBALS["REQS"]) && !(isset($GLOBALS["TABS"])))	# And there were Reqs already - tab them as 'Reqs'
			{
				$GLOBALS["TABS"][0] = t9n("[RU]Реквизиты[EN]Attributes");
				if(!isset($_REQUEST["tab"]) || ($_REQUEST["tab"] == 0))	# This was the Tab we need
				{
					$tab_from = 0;
					$tab_to = $row["ord"];
					$GLOBALS["TABS"][$row["t"]] = $row["val"];
					continue;
				}
			}
			$GLOBALS["TABS"][$row["t"]] = $row["val"];
			if(isset($_REQUEST["tab"]))
			{
				if($_REQUEST["tab"] == $row["t"])
				{
					$GLOBALS["REQS"] = Array();
					$tab_from = $row["ord"];
				}
				elseif(isset($tab_from))
					$tab_to = $row["ord"];
			}
			elseif(isset($tab_from))
				$tab_to = $row["ord"];
			else
				$tab_from = $row["ord"];
			continue;
		}
		if(isset($tab_to) # We don't need the rest of the Reqs, except Buttons; just keep collecting Tabs
				&& ($GLOBALS["REV_BT"][$row["base_typ"]] != "BUTTON"))
			continue;
		$GLOBALS["REQS"][$row["t"]]["base_typ"] = $row["base_typ"];
		$GLOBALS["REQS"][$row["t"]]["val"] = isset($row["ref_id"]) ? FetchAlias($row["attrs"], $row["val"]) : $row["val"];
		$GLOBALS["REQS"][$row["t"]]["ref_id"] = $row["ref_id"];
		$GLOBALS["REQS"][$row["t"]]["arr_id"] = $row["arr_id"];
		$GLOBALS["REQS"][$row["t"]]["attrs"] = $row["attrs"];
		$GLOBALS["REQS"][$row["t"]]["ord"] = $row["ord"];
		$GLOBALS["REQS"][$row["t"]]["restrict"] = isset($row["restr"]) ? $row["restr"] : "";
	}
	if(isset($GLOBALS["ARR_typs"]))
		$sql = "SELECT CASE WHEN typs.up=0 THEN 0 ELSE reqs.id END id, CASE WHEN typs.up=0 THEN 0 ELSE reqs.val END val
					, reqs.ord, typs.id t, count(1) arr_num";
	else
		$sql = "SELECT reqs.id, reqs.val, typs.id t, origs.t base_typ, reqs.ord";
	$sql .= ", origs.t bt, typs.val ref_val FROM $z reqs JOIN $z typs ON typs.id=reqs.t LEFT JOIN $z origs ON origs.id=typs.t WHERE reqs.up=$id";
	if(isset($GLOBALS["ARR_typs"]))
		$sql .=	" GROUP BY val, id, t";
	$data_set = Exec_sql("$sql ORDER BY reqs.ord", "GetObjectReqs");
	while($row = mysqli_fetch_array($data_set))
		if(isset($GLOBALS["REF_typs"][$row["val"]])){
    		if(!isset($rows[$row["val"]]["id"])){
    			$rows[$row["val"]]["id"] = $row["id"];
    			$rows[$row["val"]]["val"] = $row["t"];
    			$rows[$row["val"]]["ref_val"] = $row["ref_val"];
    		}
			$rows[$row["val"]]["multiselect"]["id"][] = $row["id"];
			$rows[$row["val"]]["multiselect"]["val"][] = $row["t"];
			$rows[$row["val"]]["multiselect"]["ord"][] = $row["ord"];
			$rows[$row["val"]]["multiselect"]["ref_val"][] = $row["ref_val"];
		}
		else{
   
			$rows[$row["t"]]["id"] = $row["id"];
			$rows[$row["t"]]["val"] = $row["val"];
			$rows[$row["t"]]["arr_num"] = isset($row["arr_num"]) ? $row["arr_num"] : 0;
		}
	if(isset($rows))
    	$GLOBALS["ObjectReqs"] = $rows;
}
## Act functions
# Calc the Order among the peers
function Calc_Order($up, $t)
{
	global $z;
									  
			  
	$data_set = Exec_sql("SELECT COALESCE(MAX(ord)+1, 1) FROM $z WHERE t=$t AND up=$up", "Get the Ord for new Array Object");
	if($row = mysqli_fetch_array($data_set))
		return $row[0];
	die(t9n("[RU]Не удается вычислить порядок[EN]Cannot Calc the Order"));
}
# Fetch and populate the Object requisites recursively
function Populate_Reqs($i, $new_id)
{
	global $z;
	$chil = exec_sql("SELECT $z.*, base.t base, (SELECT 1 FROM $z ch WHERE up=$z.id LIMIT 1) ch
						FROM $z LEFT JOIN $z typ ON typ.id=$z.t LEFT JOIN $z base ON base.id=typ.t WHERE $z.up=$i"
					, "Get children");
#print_r($GLOBALS);die($block."!");
	while($ch = mysqli_fetch_array($chil)) # Duplicate the Reqs
		if(!isset($_REQUEST["t".$ch["t"]]))	# We might got changes on the form
		{
			if($GLOBALS["REV_BT"][$ch["base"]] == "FILE")	# Copy the file
			{
				$id = Insert($new_id, $ch["ord"], $ch["t"], $ch["val"], "Copy file");

				$orig_path = GetSubdir($ch["id"])."/".GetFilename($ch["id"]).".".substr(strrchr($ch["val"],'.'),1);
				$new_dir = GetSubdir($id);
				@mkdir($new_dir);

				if(is_file($orig_path))
					if(copy($orig_path, $new_dir."/".GetFilename($id).".".substr(strrchr($ch["val"],'.'),1)))
						continue;
				$GLOBALS["warning"] .= t9n("[RU]Не удалось скопировать файл $orig_path в $new_dir"
				                        ."[EN]Couldn't copy file $orig_path to $new_dir")."<br>";
			}
			elseif($ch["ch"] == 1)
			{
				$id = Insert($new_id, $ch["ord"], $ch["t"], $ch["val"], "Copy child");
				Populate_Reqs($ch["id"], $id); # Populate children of this req
			}
			else
			    Insert_batch($new_id, $ch["ord"], $ch["t"], $ch["val"], "Copy req to batch");
#				Insert($new_id, $ch["ord"], $ch["t"], $ch["val"], "Copy req");
		}
}
# Retrieve all current requisites to tell the updated ones
function Get_Current_Values($id, $typ)
{
	GetObjectReqs($typ, $id);
	$rows = isset($GLOBALS["ObjectReqs"]) ? $GLOBALS["ObjectReqs"] : array();
#print_r($GLOBALS);print_r($rows);die();
	foreach($GLOBALS["REQS"] as $key => $value)
	{
		if(!is_array($value))
			continue;
		if(!(strpos($GLOBALS["REQS"][$key]["attrs"], NOT_NULL_MASK) === FALSE))
			$GLOBALS["NOT_NULL"][$key] = "";
		# Remember the base Type
		$GLOBALS["REV_BT"][$key] = $GLOBALS["REV_BT"][$GLOBALS["REQS"][$key]["base_typ"]];
		if(isset($rows[$key]))
		{
			$GLOBALS["REQS"][$key] = $rows[$key]["val"];
			$GLOBALS["REQ_TYPS"][$key] = $rows[$key]["id"];
		}
		elseif(isset($GLOBALS["REF_typs"][$key]))
		{
			$GLOBALS["REQS"][$key] = isset($rows[$GLOBALS["REF_typs"][$key]]["val"]) ? $rows[$GLOBALS["REF_typs"][$key]]["val"] : NULL;
			$GLOBALS["REQ_TYPS"][$key] = isset($rows[$GLOBALS["REF_typs"][$key]]["id"]) ? $rows[$GLOBALS["REF_typs"][$key]]["id"] : NULL;
			$GLOBALS["REV_BT"][$key] = "REFERENCE";
		}
		elseif(isset($GLOBALS["ARR_typs"][$key]))
			$GLOBALS["REQS"][$key] = isset($rows[$GLOBALS["ARR_typs"][$key]]["arr_num"]) ? $rows[$GLOBALS["ARR_typs"][$key]]["arr_num"] : NULL;
		elseif($key != $typ)
			$GLOBALS["REQS"][$key] = $GLOBALS["REQ_TYPS"][$key] = "";
		# Remember Booleans separately
		if($GLOBALS["REV_BT"][$key] == "BOOLEAN")
			if($GLOBALS["REQS"][$key] == 1)
				$GLOBALS["BOOLEANS"][$key] = 1;
	}
}
# Mention the Type in case it's not a requisite's order
function Get_Ord($parent, $typ=0)
{
	global $z;
	$result = Exec_sql("SELECT max(ord) ord FROM $z WHERE up=$parent". ($typ==0 ? "" : " AND t=$typ"), "Get Ord");
	$row = mysqli_fetch_array($result);
	return $row["ord"] + 1;
}
function GetRefOrd($parent, $typ)
{
	global $z;
	$result = Exec_sql("SELECT max(ord) ord FROM $z WHERE up=$parent AND val='$typ'", "Get Ref Ord");
	$row = mysqli_fetch_array($result);
	return $row["ord"] + 1;
}
# Add user name and some salt to the password value
function Salt($u, $val)
{
	global $z;
	$u = strtoupper($u);
	return SALT."$u$z$val";
}
# Inserts new values in a batch
function Insert_batch($up, $ord, $t, $val, $message){
	global $connection, $z;
	if(($up === "") && isset($GLOBALS["SQLbatch"])) // Close the batch
	{
    	exec_sql("INSERT INTO $z (up, ord, t, val) VALUES ".$GLOBALS["SQLbatch"], "Close batch: $message");
    	unset($GLOBALS["SQLbatch"]);
    	return;
	}
	if(isset($GLOBALS["SQLbatch"]))
    	$GLOBALS["SQLbatch"] .= ",($up,$ord,$t,'".addslashes($val)."')";
    else
        $GLOBALS["SQLbatch"] = "($up,$ord,$t,'".addslashes($val)."')";
#    trace("GLOBAL[SQLbatch] = ".$GLOBALS["SQLbatch"]);
	if(strlen($GLOBALS["SQLbatch"]) > 31000)
	{
    	exec_sql("INSERT INTO $z (up, ord, t, val) VALUES ".$GLOBALS["SQLbatch"], "Flush batch: $message");
    	unset($GLOBALS["SQLbatch"]);
	}
}
# Inserts a new value and returns the ID it got
function Insert($up, $ord, $t, $val, $message)
{
	global $connection, $z;
	exec_sql("INSERT INTO $z (up, ord, t, val) VALUES ($up, $ord, $t, '".addcslashes($val, "\\\'")."')", "Insert: $message");
	return mysqli_insert_id($connection);
}
# Update the type
function UpdateTyp($id, $t)
{
	global $z;
	Exec_sql("UPDATE $z SET t=$t WHERE id=$id", "Update Typ");
}
# Update the value
function Update_Val($id, $val){
	global $z;
	Exec_sql("UPDATE $z SET val='".addslashes($val)."' WHERE id=$id", "Update Val");
}

function die_info($msg)
{
	if(isset($GLOBALS["TRACE"]))
		echo $GLOBALS["TRACE"];
	if(($GLOBALS["GLOBAL_VARS"]["z"] == $GLOBALS["GLOBAL_VARS"]["user"]) || ($GLOBALS["GLOBAL_VARS"]["user"] == "admin"))
		die("$msg<br /><font color=\"lightgray\"><a href=\"/".$GLOBALS["GLOBAL_VARS"]["z"]."/dir_admin\">Файлы</a></font>");
	die($msg);
}
# Hierarchic tree of blocks (in the $blocks array)
# $cur_block - the parent of the tree (in case of building a sub-tree)
function Make_tree($text, $cur_block)
{
	global $blocks;
# Remove BOM, if exists
	if(substr($text, 0, 3) == pack('CCC', 0xef, 0xbb, 0xbf))
        $text = substr($text, 3);
# This makes the delimiters look like: <!-- BEGIN: block_name -->
	$begin = "begin:";		# Block begin mark
	$end = "end:";			# Block end mark
	$file = "file:";			# Block end mark
	$begin_delimiter = "<!-- ";	# Block Mark begin delimiter
	$end_delimiter = " -->";		# Block Mark end delimiter

	$exp = explode($begin_delimiter, $text);
	$patt = "/($begin|$end|$file)[[:blank:]]*(&?[A-ZА-Я0-9_ ]+)[[:blank:]]*$end_delimiter(.*)/uims";
	$blocks[$cur_block]["CONTENT"] = "";

	foreach ($exp as $key => $a)
		if(preg_match($patt, $a, $res))
		{
			$res[1] = strtolower($res[1]); # $res[1] = BEGIN or END
			$res[2] = strtolower($res[2]); # $res[2] = Block name
							# $res[3] = Block content
			if(strcasecmp($res[1], $begin) == 0)
			{
				$blocks[$cur_block.".".$res[2]]["PARENT"] = $cur_block;
				$cur_block = $cur_block.".".$res[2];
				$blocks[$cur_block]["CONTENT"] = $res[3];
			}
			elseif(strcasecmp($res[1], $end) == 0)
			{
				if($blocks[$cur_block]["PARENT"].".".$res[2] != $cur_block) 
					die_info("Invalid blocks nesting (".$blocks[$cur_block]["PARENT"].".".$res[2]." - $cur_block)!");
# If there's a Sub-Block - mark it as an insertion point (with "_block_." prefix)
				$insertion_point = "{_block_.$cur_block}";
				$cur_block = $blocks[$cur_block]["PARENT"];
				$blocks[$cur_block]["CONTENT"] .= $insertion_point.$res[3];
			}
			elseif(strcasecmp($res[1], $file) == 0)
			{
			    if($res[2] == "a")
			        $text = Get_file($GLOBALS["GLOBAL_VARS"]["action"].".html", FALSE);
				elseif(isset($_GET[$res[2]])) # Check if we have the requested template
					$text = Get_file($_GET[$res[2]].".html", FALSE);
				else
					$text = Get_file($res[2].".html", FALSE);
				if(strlen($text) == 0)
					$text = Get_file("info.html");   # Default content is in info.html
				$file_block = "$cur_block." . (isset($_REQUEST[$res[2]])?$_REQUEST[$res[2]]:$res[2]);
				$insertion_point = "{_block_.$file_block}";
				$blocks[$file_block]["PARENT"] = $cur_block;
				Make_tree($text, $file_block);
				$blocks[$cur_block]["CONTENT"] .= $insertion_point.$res[3];
#				die($_REQUEST[$res[2]].".html".$text.$cur_block);
			}
		}
		elseif($a)	# Not a block delimiter - leave as is
		{
			if($key != 0)
				$blocks[$cur_block]["CONTENT"] .= $begin_delimiter.$a;	# Restore the starting $begin_delimiter
			else
				$blocks[$cur_block]["CONTENT"] = $a;
		}
}

# Fills the insertion points in Blocks and compiles all that stuff using recursive calls
function Parse_block($block)
{
	global $blocks;
	$i = count($blocks[$block], 1);
	Get_block_data($block);
# If there are insertion points, but we haven't got any data, - return
#	if(preg_match("/\{([A-Za-z0-9\_\*\(\)\'\,\+\-\/]+?)}/", $blocks[$block]["CONTENT"]) && ($i == count($blocks[$block], 1)))
	if(preg_match("/\{([A-ZА-Я0-9_ \-]*?[^ ;\r\n])}/ui", $blocks[$block]["CONTENT"]) && ($i == count($blocks[$block], 1)))
		return "";
# Get insertion points. Attention: Sub-block pattern has a dot (.) in it!
#	preg_match_all("/\{([A-Za-z0-9\.&_\*\(\)\'\,\+\-\/]+?)}/", $blocks[$block]["CONTENT"], $temp);
	preg_match_all("/\{([A-ZА-Я0-9\.&_ \-]+?)}/ui", $blocks[$block]["CONTENT"], $temp);
	$points = $sub = array();
	foreach(array_unique($temp[1]) as $key => $value)	# remove duplicated insertion points, if any
		if(substr($value, 0, 7) != "_block_")	# Toss Sub-Blocks to the end to not str_ireplace them in the parent body
			$points[] = $value;
		else
			$sub[] = $value;
	$points = array_merge($points, $sub);
	$content = "";
	unset($end);
	while(!isset($end))
	{
		$end = 1;
		$cur_content = $blocks[$block]["CONTENT"];
# Get current Items from dataset for this block
		foreach($blocks[$block] as $key => $value)
			if(($key != "CUR_VARS") && is_array($value))
				$blocks[$block]["CUR_VARS"][$key] = array_shift($blocks[$block][$key]);
# Fill insertion points, calling Sub-Blocks parser, if any
		foreach($points as $key => $point)
		{
			unset($item);
			$point = strtolower($point);
			$sub = explode(".", $point);
			if($sub[0] == "_block_")	# If it's a Sub-Block (marked by prefix "_block_.")
			{
				trace("Got sub-block: $point");
				unset($sub[0]);
				$sub_block = implode(".", $sub);
				trace("Parse sub-block: $sub_block");
				$item = Parse_block($sub_block);	# parse Sub-Block
				$cur_content = str_ireplace("{".$point."}", $item, $cur_content);	# Insert Sub-Block
			}
			else
			{
				if(isset($blocks[$block]["CUR_VARS"][$point]))
					$item = $blocks[$block]["CUR_VARS"][$point];
				elseif($sub[0] == "_parent_")	# It's a Parent's Variable (marked by prefix "_parent_.")
				{
					$parent = $blocks[$block]["PARENT"];
					while(!isset($item))	# Seek the parent's var up to the main block
						if(isset($blocks[$parent]["CUR_VARS"][$sub[1]]))
							$item = $blocks[$parent]["CUR_VARS"][$sub[1]];	# Got it
						elseif(isset($blocks[$parent]["PARENT"]))
							$parent = $blocks[$parent]["PARENT"];	# Go upper
						else
							break;
				}
				elseif($sub[0] == "_global_")	# It's a Global Variable (marked by prefix "_global_.")
					$item = isset($GLOBALS["GLOBAL_VARS"][$sub[1]]) ? $GLOBALS["GLOBAL_VARS"][$sub[1]] : (BuiltIn("[".strtoupper($sub[1])."]")==="[".strtoupper($sub[1])."]" ? "" : BuiltIn("[".strtoupper($sub[1])."]"));
				elseif($sub[0] == "_request_")	# It's a _REQUEST var (marked by prefix "_request_.")
				{
					foreach($_GET as $k => $v)
						if(strtolower($k) == $sub[1])
						{
							$item = $v;
							break;
						}
					foreach($_POST as $k => $v)
						if(strtolower($k) == $sub[1])
						{
							$item = $v;
							break;
						}
				}
				if(isset($item))	# Insert item, masking "{"
					$cur_content = str_ireplace("{".$point."}", str_replace("{", "&#123;", $item), $cur_content);
				else
					break;	# Break the parsing upon first missing value (to not process the sub-blocks)
				if(isApi() && ($sub[0] != "_global_"))
					$GLOBALS["GLOBAL_VARS"]["api"][$block][$point][] = str_replace("{", "&#123;", $item);
				if(isset($blocks[$block][$point]))
				    if(count($blocks[$block][$point]))	# Check, is there any more data
                        unset($end);
			}
		}
# Accept only fully filled portions of Block content
#		if(!preg_match("/\{([A-Za-z0-9\.&_\*\(\)\'\,\+\-\/]+?)}/", $cur_content) || isset($_REQUEST["debug"]))
		if(!preg_match("/\{([A-ZА-Я0-9\.&_ \-]*?[^ ;\r\n])}/ui", $cur_content) || isset($_REQUEST["debug"]))
			$content .= $cur_content;
	}
	if(($block == "&main") || ($block == ""))  # Replace "{" only returning the complete result (not a sub-block)
		return str_replace("&#123;", "{", $content);
	else
		return $content;
}
function localize($text){
    global $locale;
    return preg_replace("(<t9n>.*\[$locale](.*?)(\[.*)*<\/t9n>)", "$2", $text);
}
# Human-friendly file size
function NormalSize($size)
{
   if($size < 1024)
       return $size." B";
   elseif($size < 1048576)
       return round($size/1024, 2)." KB";
   elseif($size < 1073741824)
       return round($size/1048576, 2)." MB";
   elseif($size < 1099511627776)
       return round($size/1073741824, 2)." GB";
   else
       return round($size/1099511627776, 2)." TB";
}
function smtpmail($to, $mail_to, $subject, $message, $headers='') {
	global $mail_config;
	$SEND =	"Date: ".date("D, d M Y H:i:s") . " UT\r\n";
	$SEND .= 'Subject: =?'.$mail_config['smtp_charset'].'?B?'.base64_encode($subject)."=?=\r\n";
	if ($headers) $SEND .= $headers."\r\n\r\n";
	else
	{
			$SEND .= "Reply-To: IdeaV\r\n";
			$SEND .= "To: \"=?".$mail_config['smtp_charset']."?B?".base64_encode($to)."=?=\" <$mail_to>\r\n";
			$SEND .= "MIME-Version: 1.0\r\n";
			$SEND .= "Content-Type: text/plain; charset=\"".$mail_config['smtp_charset']."\"\r\n";
			$SEND .= "Content-Transfer-Encoding: 8bit\r\n";
			$SEND .= "From: \"=?".$mail_config['smtp_charset']."?B?".base64_encode($mail_config['smtp_from'])."=?=\" <".$mail_config['smtp_username'].">\r\n";
			$SEND .= "X-Priority: 3\r\n\r\n";
	}
	$SEND .=  $message."\r\n";

    $file = fopen("logs/sendmail.txt", "a+");
    fwrite($file, "\n---SEND---\n".$SEND."\n---------\n");
    fclose($file);

	 if( !$socket = fsockopen($mail_config['smtp_host'], $mail_config['smtp_port'], $errno, $errstr, 30) ) {
		if ($mail_config['smtp_debug']) echo $errno."<br>".$errstr;
		echo "fsockopen failed";
		return false;
	 }
 
	if (!server_parse($socket, "220", __LINE__)) return false;
 
	fputs($socket, "HELO " . $mail_config['smtp_host'] . "\r\n");
	if (!server_parse($socket, "250", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Не могу отправить HELO!</p>';
		fclose($socket);
		return false;
	}
	fputs($socket, "AUTH LOGIN\r\n");
	if (!server_parse($socket, "334", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Не могу найти ответ на запрос авторизаци.</p>';
		fclose($socket);
		return false;
	}
	fputs($socket, base64_encode($mail_config['smtp_username']) . "\r\n");
	if (!server_parse($socket, "334", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Логин авторизации не был принят сервером!</p>';
		fclose($socket);
		return false;
	}
	fputs($socket, base64_encode($mail_config['smtp_password']) . "\r\n");
	if (!server_parse($socket, "235", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Пароль длиной '.strlen($mail_config['smtp_password']).' не был принят сервером как верный! Ошибка авторизации!</p>';
		fclose($socket);
		return false;
	}
	fputs($socket, "MAIL FROM: <".$mail_config['smtp_username'].">\r\n");
	if (!server_parse($socket, "250", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Не могу отправить команду MAIL FROM: </p>';
		fclose($socket);
		return false;
	}
	fputs($socket, "RCPT TO: <" . $mail_to . ">\r\n");
 
	if (!server_parse($socket, "250", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Не могу отправить команду RCPT TO: </p>';
		fclose($socket);
		return false;
	}
	fputs($socket, "DATA\r\n");
 
	if (!server_parse($socket, "354", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Не могу отправить команду DATA</p>';
		fclose($socket);
		return false;
	}
	fputs($socket, $SEND."\r\n.\r\n");
 
	if (!server_parse($socket, "250", __LINE__)) {
		if ($mail_config['smtp_debug']) echo '<p>Не смог отправить тело письма. Письмо не было отправленно!</p>';
		fclose($socket);
		return false;
	}
	fputs($socket, "QUIT\r\n");
	fclose($socket);
	return TRUE;
}
 
function server_parse($socket, $response, $line = __LINE__) {
	global $mail_config;
	while (@substr($server_response, 3, 1) != ' ') {
		if (!($server_response = fgets($socket, 256))) {
			if ($mail_config['smtp_debug']) echo "<p>Проблемы с отправкой почты!</p>$response<br>$line<br>";
 			return false;
 		}
	}
	if (!(substr($server_response, 0, 3) == $response)) {
		if ($mail_config['smtp_debug']) echo "<p>Проблемы с отправкой почты!</p>$response<br>$line<br>";
		return false;
	}
	return true;
}
function mysendmail($to,$subj,$msg){
    global $mail_config;
    wlog("===== ".date("d.m.y H:m:s ")."\nTo $to\nSubj: $subj\nMsg: $msg", "log");
    $res = "id:".smtpmail($to, $to, $subj, $msg);
    wlog("\nResult: ".($res ? " Ok" : " Failed")."\n=====\n", "log");
    return $res;
}
function pwd_reset($u)
{
	global $z;
	$data_set = Exec_sql("SELECT u.id, email.val, pwd.id pwd, phone.val phone, pwd.val old, u.val u
						FROM $z u LEFT JOIN $z email ON email.up=u.id AND email.t=".EMAIL
						." LEFT JOIN $z pwd ON pwd.up=u.id AND pwd.t=".PASSWORD
						." LEFT JOIN $z phone ON phone.up=u.id AND phone.t=".PHONE
						." WHERE u.val='$u' AND u.t=".USER
					, "Get user's reqs");
	if(!($row = mysqli_fetch_array($data_set))){
    	$data_set = Exec_sql("SELECT u.id, email.val, pwd.id pwd, phone.val phone, pwd.val old, u.val u
    						FROM $z u LEFT JOIN $z email ON email.up=u.id AND email.t=".EMAIL
    						." LEFT JOIN $z pwd ON pwd.up=u.id AND pwd.t=".PASSWORD
    						." LEFT JOIN $z phone ON phone.up=u.id AND phone.t=".PHONE
    						." WHERE email.val='$u' AND u.t=".USER
    					, "Get user's reqs by email");
    	$row = mysqli_fetch_array($data_set);
	}
#print_r($GLOBALS); die();
	if($row){
	    $u = $row["u"];
		$pwd = substr(md5(mt_rand()), 0, 6);	# Create the password
		$sha = sha1(Salt($u, $pwd));	# Make the password hash
		if(preg_match(MAIL_MASK, $row["val"])){
			if($row["pwd"])  # There is a password already
			{
				mysendmail($row["val"], t9n("[RU]Сброс пароля [EN]Password reset for ").$z
					, t9n("[RU]Ваш новый пароль [EN]Your new password ")."$pwd\r\n"
					    .t9n("[RU]Для подтверждения его перейдите по ссылке:[EN]Confirm it here before use")
					    .": https://".$_SERVER["SERVER_NAME"]."/$z/confirm?u=".urlencode($u)."&p=$sha&o=".$row["old"]
                		."\r\n\r\n".t9n("[RU]С уважением,\r\nКоманда Интеграл[EN]Best regards,\r\nIdeaV team")
                		."\r\n\r\n".t9n("[RU]Если вы не хотите получать от нас писем, связанных с регистрацией $z, вы можете отписаться от оповещений:"
                                        ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?optout=$z"
                	                ."[EN]In case you do not want to receive messages regarding your registration and the $z database, unsubscribe here:"
                                        ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?optout=$z")
				    );
				login($z, $u, "MAIL", t9n("[RU]Пароль отправлен по почте, подтвердите его смену по ссылке из письма[EN]The password is sent by email, please confirm it by the provided link"));
			}
			else	# No password yet, thus no confirmation required
			{
				mysendmail($row["val"], t9n("[RU]Ваш новый пароль[EN]Your new password")
					, t9n("[RU]Ваш новый пароль [EN]Your new password ")."$pwd\r\nhttps://".$_SERVER["SERVER_NAME"]."/$z/?login=".urlencode($u));
				Insert($row["id"], 1, PASSWORD, $sha, "Create the password record");
				login($z, $u, "NEW_PWD", t9n("[RU]Пароль отправлен по почте[EN]The password is sent by email"));
			}
		}
		elseif(strlen($row["phone"])){
			$phone = preg_replace('![^0-9]+!', '', $row["phone"]);
			if(strlen($phone) == 11)
				if((substr($phone, 0, 2) == '89') || (substr($phone, 0, 2) == '79'))
				{
					if($row["pwd"])  # There is a password already
						Update_Val($row["pwd"], $sha);
					else
						Insert($row["id"], 1, PASSWORD, $sha, "Create the password record");
#							$rep = file_get_contents(SMS_OP."&sadr=".SMS_SADR."&dadr=$phone&text=Пароль:%20$pwd");
					$GLOBALS["GLOBAL_VARS"]["code"] = file_get_contents(SMS_OP."&sadr=".SMS_SADR."&dadr=$phone&text="
					       .t9n("[RU]Пароль[EN]Password").":%20$pwd"
					       .t9n("[RU]%20Рекомендуем%20сменить%20пароль%20после%20авторизации[EN]%20We%20recommend%20to%20change%20it%20upon%20first%20login"));
#							$rep = file_get_contents(SMS_OP."&sadr=".SMS_SADR."&dadr=$phone&text=$pwd");
					$GLOBALS["GLOBAL_VARS"]["sms"] = substr($phone, 7);
                	login($z, $u, "SMS", t9n("[RU]Пароль отправлен в SMS[EN]The password is sent via SMS"));
				}
		}
		setcookie($z, "", time() - 3600, "/");  # Remove the password and secret cookies
		setcookie("secret", "", time() - 3600, "/");
	}
	login($z, $u,"WRONG_CONT", t9n("[RU]Неверное имя, email или телефон в ЛК[EN]The user name, email or phone invalid set in your Space"));
}
function check()
{
    if(isset($_POST["_xsrf"]))
    	if($GLOBALS["GLOBAL_VARS"]["xsrf"] == $_POST["_xsrf"]) # Check the xsrf token
	    	return true;
	if($GLOBALS["GLOBAL_VARS"]["xsrf"] == ADMINHASH)
    	return true;
    header('HTTP/1.0 403 Forbidden');
	my_die(t9n("[RU]Неверный или устаревший токен CSRF<br/>[EN]Invalid or expired CSRF token <br/>"));
}
function api_dump($json, $name="api.json")
{
	sendJsonHeaders($name);
	ob_start();
	$api = fopen("php://output", 'w');
	fwrite($api, $json);
	fclose($api);
	echo ob_get_clean();
	die();
}
function myexit(){
    global $z, $logFile;
	if(isset($GLOBALS["TRACE"])){
        $file = fopen($logFile, "a+");
        fwrite($file, print_r($GLOBALS["GLOBAL_VARS"], TRUE));
        fclose($file);
	}
	exit();
}
function mywrite($t, $mode="a+")
{
    global $z;
	if(!is_dir($path="templates/custom/$z/logs"))
		mkdir($path);
    $file = fopen("$path/trace.log", $mode);
    fwrite($file, "$t\r\n");
    fclose($file);
}
function CheckRepColGranted($id, $level=0){
    global $z;
	$row = mysqli_fetch_array(Exec_sql("SELECT obj.up, req.id req FROM $z obj LEFT JOIN ($z req CROSS JOIN $z par) ON req.t=obj.id AND par.up=0 AND req.up=par.id WHERE obj.id=$id"
	                        , "Check Rep Col Granted"));
	if($level !== 0){
  
	    if($row["up"] == 0){
	  
    	    if(!Grant_1level($id))
                my_die(t9n("[RU]Нет доступа на запись к объекту с типом $id [EN]Object type #$id is not granted for changes"));
	    }
	    else
    	    Check_Grant($row["up"], $id);
	}
    elseif(!Grant_1level($row["up"] == 0 ? $id : $row["up"]) && !Grant_1level($row["req"]))
        my_die(t9n("[RU]Нет доступа к объекту с типом ".($row["up"] == 0 ? $id : $id.":".$row["up"]).".[EN]Object type #".($row["up"] == 0 ? $id : $id.":".$row["up"])." is not granted"));
}
function isDbVacant($db){
    global $z;
    if($row = mysqli_fetch_array(Exec_sql("SELECT 1 FROM $z WHERE val='$db' AND t=".DATABASE, "Check DB name uniquity")))
	    return false;
    return true;
}
function checkNewRef($val, $t, $fatal=true){
    global $z;
    if(!($row = mysqli_fetch_array(Exec_sql("SELECT 1 FROM $z WHERE id=$val AND t=$t", "Check new Ref"))))
        if($fatal)
            die(t9n("[RU]Неверная ссылка $val:[EN]Wrong Reference $val:").$t);
        else
            return false;
    return true;
}
function checkDuplicatedReqs($id, $t){
    global $z;
    $data_set = Exec_sql("SELECT id FROM $z WHERE up=$id AND t=$t ORDER BY id DESC", "Check Duplicated Reqs");
    # Skip the first req
    $row = mysqli_fetch_array($data_set);
    # Drop the others, if any
    while($row = mysqli_fetch_array($data_set))
        Delete($row["id"]);
}
function base64UrlDecode($input) {
    $remainder = strlen($input) % 4;
    if ($remainder) {
        $addlen = 4 - $remainder;
        $input .= str_repeat('=', $addlen);
    }
    return base64_decode(strtr($input, '-_', '+/'));
}
function verifyJWT($jwt, $publicKey) {
    list($header, $payload, $signature) = explode('.', $jwt, 3);

    if(!$signature)
	    die("{\"warning\":\"Incorrect JWT\"}");
    $headerDecoded = base64UrlDecode($header);
    $payloadDecoded = base64UrlDecode($payload);
    $signatureDecoded = base64UrlDecode($signature);

    $publicKeyObject = openssl_pkey_get_public($publicKey);
    $verified = openssl_verify("$header.$payload", $signatureDecoded, $publicKeyObject, OPENSSL_ALGO_SHA256);

    if($verified === 1){
        $now = time();
        $payload = json_decode($payloadDecoded, true);
        if (!array_key_exists('iat', $payload) || !array_key_exists('exp', $payload))
    	    die("{\"error\":\"JWT iat or exp missing\"}");

        $iat = $payload['iat'];
        $exp = $payload['exp'];
        if ($now > $exp || $now < $iat)
    	    die("{\"error\":\"JWT expired\"}");

        return ['header' => $headerDecoded, 'payload' => $payloadDecoded];
    }
    else
        return false;
}
function removeMasks($attrs){
	$attrs = str_replace(NOT_NULL_MASK, "", $attrs); # Remove NOT_NULL, MULTI, and ALIAS by mask
	$attrs = str_replace(MULTI_MASK, "", $attrs);
	return preg_replace(ALIAS_MASK, "", $attrs);
}
function authJWT($u){
	global $z;
	$data_set = Exec_sql("SELECT u.id uid, u.val, tok.id tok, act.id act, xsrf.id xsrf
							FROM $z u LEFT JOIN $z act ON act.up=u.id AND act.t=".ACTIVITY
								." LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN
								." LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=".XSRF
							." WHERE u.t=".USER." AND u.val='$u'"
					, "Authenticate user");
	if($row = mysqli_fetch_array($data_set))
	{
		$GLOBALS["GLOBAL_VARS"]["user"] = $row["val"];
		$GLOBALS["GLOBAL_VARS"]["user_id"] = $row["uid"];
		updateTokens($row);
#		setcookie($z, $GLOBALS["GLOBAL_VARS"]["token"], time() + COOKIES_EXPIRE, "/"); # 30 days
		setcookie($z, $GLOBALS["GLOBAL_VARS"]["token"], 0, "/"); # Uon browser close
    	api_dump(json_encode(array("_xsrf"=>$GLOBALS["GLOBAL_VARS"]["xsrf"],"token"=>$GLOBALS["GLOBAL_VARS"]["token"],"id"=>$GLOBALS["GLOBAL_VARS"]["user_id"],"user"=>$GLOBALS["GLOBAL_VARS"]["user"])), "login.json");
	}
	else
	    die("{\"error\":\"No user found\"}");
}
# ################# Start here #################
$time_start = microtime(TRUE);
$blocks = array();
$a = $GLOBALS["GLOBAL_VARS"]["action"] = isset($com[2]) ? $com[2] : "";
$next_act = isset($_REQUEST["next_act"]) ? addslashes($_REQUEST["next_act"]) : "";

if(isset($com[3]))
    if(is_numeric($com[3]))
        $id = (int)$com[3];
    elseif($a === "report" || $a === "smartq" || $a === "sql"){
    	if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE t=".REPORT." AND val='".addslashes(urldecode($com[3]))."'", "Get report by name")))
    	    $id = $row["id"];
    	else
    	    my_die(t9n("[RU]Запрос не найден[EN]Report not found"));
    }
    elseif($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE up=0 AND val='".addslashes(urldecode($com[3]))."'", "Get object by name"))){
	    $id = $row["id"];
        if(isset($com[4]))
        	if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE t=$id AND val='".addslashes(urldecode($com[4]))."'", "Get record by name")))
        	    $id = $row["id"];
	}
if(!isset($id))
    $id = "";
$GLOBALS["GLOBAL_VARS"]["id"] = $id;

#Exec_sql("Set transaction isolation level read uncommitted", "No lock");
Exec_sql("SET SESSION optimizer_search_depth = 9", "Search depth");

switch($a)  # Check actions, which don't require authentication
{
	case "jwt":
        $params = verifyJWT($_POST["jwt"], JWT_PUBLIC_KEY);
        if($params){
            $params = json_decode($params["payload"], false);
            authJWT($params->data->userId);
        }
        else
            die("{\"error\":\"JWT verification failed\"}");
		break;
		
	case "auth":
		$GLOBALS["GLOBAL_VARS"]["uri"] = isset($_POST["uri"]) ? htmlentities($_POST["uri"]) : "/$z";
		$u = addslashes(strtolower($_POST["login"]));
		if(isset($_POST["reset"]) || isset($_GET["reset"]))  # A new user wants to get the password
			pwd_reset($u);
		if(isset($_POST["tzone"]))
		{
			$GLOBALS["tzone"] = round(((int)$_POST["tzone"] - time() - date("Z"))/1800)*1800; # Round the time zone shift to 30 min
			setcookie("tzone", $GLOBALS["tzone"], time() + COOKIES_EXPIRE, "/"); # 30 days
		}
		$msg = "";
		$p = $_POST["pwd"];
		$pwd = sha1(Salt($u, $p)); # Add some salt
		$data_set = Exec_sql("SELECT u.id uid, u.val, pwd.id pwd_id, pwd.val pwd, tok.id tok, tok.val token, act.id act, xsrf.id xsrf
								FROM $z pwd, $z u LEFT JOIN $z act ON act.up=u.id AND act.t=".ACTIVITY
									." LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN
									." LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=".XSRF
								." WHERE u.t=".USER." AND u.val='$u' AND pwd.up=u.id AND pwd.val='$pwd'"
						, "Authenticate user");
		$row = mysqli_fetch_array($data_set);
		if(!$row){ # Check the user Cabinet
		    $prevz = $z;
		    $z = "my";
    		$pwd = sha1(Salt($u, $p)); # Add some salt
		    $z = $prevz;
    		$data_set = Exec_sql("SELECT 1 FROM my email JOIN my pwd ON pwd.up=email.up AND pwd.val='$pwd'"
                					."     JOIN my db ON db.up=email.up AND db.val='$z' AND db.t=".DATABASE
                					." WHERE email.t=".EMAIL." AND email.val='$u'"
					    , "Authenticate in Cabinet");
    		if($row = mysqli_fetch_array($data_set)){
        		$data_set = Exec_sql("SELECT u.id uid, u.val, pwd.id pwd_id, pwd.val pwd, tok.id tok, tok.val token, act.id act, xsrf.id xsrf
        								FROM $z pwd, $z u LEFT JOIN $z act ON act.up=u.id AND act.t=".ACTIVITY
        									." LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN
        									." LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=".XSRF
        								." WHERE u.t=".USER." AND u.val='$z' AND pwd.up=u.id"
        						, "Authenticate user from Cabinet");
        		$row = mysqli_fetch_array($data_set);
    		}
		}
		if($row){
			$GLOBALS["GLOBAL_VARS"]["user"] = $row["val"];
			$GLOBALS["GLOBAL_VARS"]["user_id"] = $row["uid"];
			if(isset($_POST["change"]))
			{
				$npw1 = isset($_POST["npw1"]) ? $_POST["npw1"] : "";
				$npw2 = isset($_POST["npw2"]) ? $_POST["npw2"] : "";
				
				if(mb_strlen($npw1) < 6)
					$msg .= t9n("[RU]Новый пароль должен быть не короче 6 символов[EN]Password must be at lest 6 symbols long")." [errShort]. ";
				elseif($npw1 === $p)
					$msg .= t9n("[RU]Новый пароль должен отличаться от старого[EN]The new password must differ from the old one")." [errOld]. ";
				elseif($npw1 != $npw2)
					$msg .= t9n("[RU]Введите новый пароль дважды одинаково[EN]Please input the same password twice")." [errDiffer]. ";
				else
				{
					Update_Val($row["pwd_id"], sha1(Salt($u, $npw1)));
					$msg = t9n("[RU]Пароль успешно изменен[EN]The password has been changed");
				}
			}
			updateTokens($row);
#			if(isset($_POST["save"]))
#				setcookie($z, $GLOBALS["GLOBAL_VARS"]["token"], 0, "/");  # The cookie to be deleted upon the session close
#			else
				setcookie($z, $GLOBALS["GLOBAL_VARS"]["token"], time() + COOKIES_EXPIRE, "/"); # 30 days
		}
		elseif((strtolower($u) == "admin") && (sha1(sha1($_SERVER["SERVER_NAME"].$z.$p).$z) === sha1(ADMINHASH.$z))){
			$GLOBALS["GLOBAL_VARS"]["user"] = $GLOBALS["GLOBAL_VARS"]["role"] = "admin";
			$GLOBALS["GLOBAL_VARS"]["user_id"] = 0;
			$GLOBALS["GLOBAL_VARS"]["xsrf"] = sha1($z.ADMINHASH);
			$GLOBALS["GLOBAL_VARS"]["token"] = sha1(ADMINHASH.$z);
			setcookie($z, sha1(ADMINHASH.$z), 0, "/");
		}
		elseif(isApi())
		    my_die(t9n("[RU]Неверный логин или пароль $u @ $z".". Логин и пароль следует отправлять POST-параметрами.[EN]Wrong credentials for user $u in $z".". Please send login and password as POST-parameters."));
		else
			login($z, $_REQUEST["u"], "wrong");
		if(isApi())
			api_dump(json_encode(array("_xsrf"=>$GLOBALS["GLOBAL_VARS"]["xsrf"],"token"=>$GLOBALS["GLOBAL_VARS"]["token"],"id"=>$GLOBALS["GLOBAL_VARS"]["user_id"],"msg"=>$msg)), "login.json");
		if($msg!=="")
			die($msg.BACK_LINK);
	    if(substr($GLOBALS["GLOBAL_VARS"]["uri"],0,strlen($z)+1) != "/$z")
		    $GLOBALS["GLOBAL_VARS"]["uri"] = "/$z";
		header("Location: ".$GLOBALS["GLOBAL_VARS"]["uri"]);
		die();
		break;

	case "confirm":
		if($row = mysqli_fetch_array(Exec_sql("SELECT pwd.id FROM $z pwd, $z u WHERE pwd.up=u.id AND pwd.t=".PASSWORD
						." AND u.t=".USER." AND u.val='".addslashes($_REQUEST["u"])."' AND pwd.val='".addslashes($_REQUEST["o"])."'"
						, "Get user's pwd")))
		{
			Exec_sql("UPDATE $z SET val='".addslashes($_REQUEST["p"])."' WHERE id=".$row[0], "Reset the password");
			login($z,$_REQUEST["u"],"confirm");
		}
		login($z, urlencode($_REQUEST["u"]), "obsolete");
		break;

	case "login":
		login($z,htmlentities($_REQUEST["u"]));
		break;
    
	case "getcode":
		$u = addslashes(strtolower($_REQUEST["u"]));
		if(preg_match(MAIL_MASK, $u))
		{
    		if(isset($_POST["tzone"]))
    		{
    			$GLOBALS["tzone"] = round(((int)$_POST["tzone"] - time() - date("Z"))/1800)*1800; # Round the time zone shift to 30 min
    			setcookie("tzone", $GLOBALS["tzone"], time() + COOKIES_EXPIRE, "/"); # 30 days
    		}
    		$data_set = Exec_sql("SELECT tok.val FROM $z u LEFT JOIN $z tok ON tok.up=u.id AND tok.t=".TOKEN." WHERE u.t=".USER." AND u.val='$u'"
    						, "Get the user token");
    		if($row = mysqli_fetch_array($data_set))
    		{
				mysendmail($u, t9n("[RU]Одноразовый пароль [EN]One time password ").$u
					, t9n("[RU]Ваш код для входа: [EN]Your password is: ").strtoupper(substr($row["val"], 0, 4))
                		."\r\n\r\n".t9n("[RU]Если вы не хотите получать от нас писем, связанных с регистрацией $u, вы можете отписаться от оповещений:"
                                        ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?optout=$u"
                	                ."[EN]In case you do not want to receive messages regarding your registration and the $u database, unsubscribe here:"
                                        ."\r\nhttps://".$_SERVER["SERVER_NAME"]."/my/register?optout=$u")
					    );
    		    die('{"msg":"ok"}');
    		}
    		else
    		    die('{"msg":"new"}');
		}
	    die('{"error":"invalid user"}');
		break;
		
	case "checkcode":
		$c = addslashes(strtolower($_REQUEST["c"]));
		$u = addslashes(strtolower($_REQUEST["u"]));
		if(preg_match(MAIL_MASK, $u) && (strlen($c) == 4))
		{
    		$data_set = Exec_sql("SELECT u.id, tok.id tok, xsrf.id xsrf, act.id act FROM $z tok, $z u"
    		                        ." LEFT JOIN $z act ON act.up=u.id AND act.t=".ACTIVITY
									." LEFT JOIN $z xsrf ON xsrf.up=u.id AND xsrf.t=".XSRF
    		                    ." WHERE u.t=".USER." AND u.val='$u' AND tok.up=u.id AND tok.t=".TOKEN." AND tok.val LIKE '$c%'"
    						, "Check the user token");
    		if($row = mysqli_fetch_array($data_set))
    		{
    			$token = md5(microtime(TRUE));
    			$xsrf = xsrf($token, $u);
				Update_Val($row["tok"], $token);

    			if($row["xsrf"])
    				Update_Val($row["xsrf"], $xsrf);
    			else
    				Insert($row["id"], 1, XSRF, $xsrf, "Save xsrf");
    			if($row["act"])
    				Update_Val($row["act"], microtime(TRUE));
    			else
    				Insert($row["id"], 1, ACTIVITY, microtime(TRUE), "Save activity time");
    		    die('{"token":"'.$token.'","_xsrf":"'.$xsrf.'"}');
    		}
    		else
    		    die('{"error":"user not found"}');
		}
	    die('{"error":"invalid data"}');
		break;
}

$GLOBALS["GLOBAL_VARS"]["uri"] = htmlentities($_SERVER["REQUEST_URI"]);
if(Validate_Token())
{
#print_r($GLOBALS); die();
    $_REQUEST = array_merge($_POST, $_GET);
    $up = isset($_REQUEST["up"]) ? (int)$_REQUEST["up"] : 0;
    $t = isset($_REQUEST["t"]) ? (int)$_REQUEST["t"] : 0;
    $val = isset($_REQUEST["val"]) ? $_REQUEST["val"] : "";
    $unique = isset($_REQUEST["unique"]) ? 1 : 0;
    $arg = "";

	if(substr($a, 0, 3) == "_m_") # This is a DML action
		check();
	elseif(substr($a, 0, 3) == "_d_") # This is a DDL action
		if((Check_Types_Grant() == "WRITE") && check())
    		$next_act = $next_act=="" ? "edit_types" : $next_act;
    	else
			die($GLOBALS["GLOBAL_VARS"]["role"].": ".t9n("[RU]У вас нет прав на редактирование типов(".$GLOBALS["GRANTS"][0].").[EN]You don't have permission to edit types (".$GLOBALS["GRANTS"][0].")."));
	switch ($a)
	{
		case "_m_up":
			Check_Grant($id);
			$result = Exec_sql("SELECT obj.t, obj.up, obj.ord, max(peers.ord) new_ord
								FROM $z obj LEFT JOIN $z peers ON peers.up=obj.up AND peers.t=obj.t AND peers.ord<obj.ord
								WHERE obj.id=$id", "Get new Order and other Reqs");
#print_r($GLOBALS); die();
			if($row = mysqli_fetch_array($result))
			{
				$up = $row["up"];
				$id = $row["t"];
				if($row["new_ord"] > 0)
					Exec_sql("UPDATE $z SET ord=(CASE WHEN ord=".$row["ord"]." THEN ".$row["new_ord"]
												." WHEN ord=".$row["new_ord"]." THEN ".$row["ord"]
							." END) WHERE up=$up AND (ord=".$row["ord"]." OR ord=".$row["new_ord"].")", "Change Req order");
			}
			else
				exit("No arr recs");
			$arg = "F_U=$up";
			$a = "object";
			break;

		case "_m_ord":
	        if(!is_numeric($_REQUEST["order"]) || ((int)$_REQUEST["order"] < 1))
        		die("Invalid order");
			Check_Grant($id);
        	$newOrd = (int)$_REQUEST["order"];
			$result = Exec_sql("SELECT obj.ord, obj.up FROM $z obj, $z par WHERE obj.id=$id AND par.id=obj.up AND par.up!=0", "Check the obj");
			if($row = mysqli_fetch_array($result)){
			    if("$newOrd" !== $row["ord"]){
			        $rid = $id;
    				$id = $row["up"];
    				$ord = $row["ord"];
    				Exec_sql("UPDATE $z SET ord=(CASE WHEN id=$rid THEN LEAST($newOrd, (SELECT max(ord) FROM $z WHERE up=$id)) ELSE ord+SIGN($ord-$newOrd) END)"
    						." WHERE up=$id AND ord BETWEEN LEAST($ord, $newOrd) AND GREATEST($ord, $newOrd)", "Set exact obj order");
			    }
    			$obj=$id;
			}
			else
			    my_die(t9n("[RU]Не найден id=$id [EN] Id=$id not found"));
			break;

		case "_m_id":
	        if(!is_numeric($_REQUEST["new_id"]) || ((int)$_REQUEST["new_id"] < 1))
        		die("Invalid ID");
			Check_Grant($id);
        	$newId = (int)$_REQUEST["new_id"];
			$result = Exec_sql("SELECT up FROM $z WHERE id=$newId OR (id=$id AND up=0)", "Check the new id");
			if($row = mysqli_fetch_array($result))
			    if($row["up"] === "0")
    			    my_die(t9n("[RU]Это id метаданных[EN]This id belongs to metadata"));
    		    else
    			    my_die(t9n("[RU]Новый id занят[EN]The new id is occupied"));
			Exec_sql("UPDATE $z SET id=$newId WHERE id=$id", "Set exact ID");
			Exec_sql("UPDATE $z SET up=$newId WHERE up=$id", "Set up to exact ID");
			Exec_sql("UPDATE $z SET t=$newId WHERE t=$id", "Set t for exact ID");
			$obj=$newId;
			$id=$newId;
			break;

		case "_m_set":
		    $t = 0;
		    $obj = $id;
		    $id = "";
			foreach($_REQUEST as $key => $val) # Check if we have an attribute set
				if((substr($key, 0, 1) == "t") && ((int)substr($key, 1)!=0)){
				    $t = (int)substr($key, 1);
        			Check_Grant($obj, $t);
        			# Get the Object's ID value and Type
        			$result = Exec_sql("SELECT a.id, a.t ref_val, a.val, def.t, req.val attrs FROM $z obj JOIN $z req ON req.up=obj.t AND req.id=$t JOIN $z def ON def.id=req.t
        									LEFT JOIN $z a ON a.up=$obj AND (a.t=$t OR a.val='$t') WHERE obj.id=$obj", "Get Attr Type");
#print_r($GLOBALS);die($obj);
        			if($row = mysqli_fetch_array($result)){
        				$cur_id = $row["id"];
        				if(!isset($GLOBALS["basics"][$row["t"]])){	# Reference - its type is not a base one
        				    if(strpos($row["attrs"], MULTI_MASK) !== false){
        				        $deft = $row["t"];
        				        # Get the current set of Refs
        				        do{
                			        $ref_list[$row["ref_val"]] = "";
                			    } while($row = mysqli_fetch_array($result));
                			    # There might be a set of Refs in an array
        				        if(!is_array($val))
        				            $val = Array($val);
        				        foreach($val as $ref){
                					$ref = (int)$ref;
                					if(isset($ref_list["$ref"])){ # This Ref is already on the list
        				                $GLOBALS["warning"] = (isset($GLOBALS["warning"]) ? $GLOBALS["warning"] : "") . t9n("[RU] Уже есть в списке[EN] Already on the list").": $ref";
                					    continue;
            				        }
        				            if(!$ref || !checkNewRef($ref, $deft, false)){ # Skip invalid Ref
        				                $GLOBALS["warning"] = (isset($GLOBALS["warning"]) ? $GLOBALS["warning"] : "") . t9n("[RU] Неверная ссылка[EN] Wrong Reference").": $t - $ref";
        				                continue;
        				            }
            						$id = Insert($obj, GetRefOrd($obj, $t), $ref, "$t", "Insert new Ref Attr"); # A new Value
        				        }
        				        if($id !== "")
            						checkDuplicatedReqs($obj, $t);
        				    }
        				    else{
                				$cur_val = $row["ref_val"];
            					$val = (int)$val;
            					if($val)
            						checkNewRef($val, $row["t"]);
            					if($cur_id){
            						if($val){
            						    $id = $cur_id;
            							if($val != $cur_val)
            								Exec_sql("UPDATE $z SET t=$val WHERE id=$cur_id", "Update Reference Attr");
            						}
            						else
            							Delete($row["id"]);
            					}
            					elseif($val){
			  
            						$id = Insert($obj, 1, $val, "$t", "Insert new Ref Attr"); # A new Value
            						checkDuplicatedReqs($obj, $t);
            					}
        				    }
        				}
        				else{
            				$cur_val = $row["val"];
            				trace("BuiltIn $val of ".$row["t"]." = ".BuiltIn($val));
            				trace(" base = ".$GLOBALS["REV_BT"][$row["t"]]);
            				if(!in_array($t, array(101, 102, 103, 132, 49)))
            					$val = BuiltIn($val);
        					# Format the value
        					if(($GLOBALS["REV_BT"][$row["t"]] == "NUMBER") && ($val != 0))
        						$val = (int)$val;
        					elseif(($GLOBALS["REV_BT"][$row["t"]] == "SIGNED") && ($val != 0))
        						$val = (double)str_replace(",",".",$val);
        					else
        						$val = Format_Val($row["t"], $val);
        					if($cur_id){ # The Req exists
        					    $id = $cur_id;
        						if($val==""){
        							if($GLOBALS["REV_BT"][$row["t"]] === "FILE") // Remove the file from the server
        							    RemoveDir(GetSubdir($cur_id)."/".GetFilename($cur_id).".".substr(strrchr($cur_val,'.'),1));
        							Delete($cur_id);
        						}
        						else{
        							$val = Format_Val($row["t"], $val);
        							if($val != $cur_val)
        								Update_Val($cur_id, $val);
        						}
        					}
        					elseif($val!=""){
        						$id = Insert($obj, 1, $t, $val, "Insert new non-empty rec");
        						checkDuplicatedReqs($obj, $t);
        					}
        				}
        			}
				}
			foreach($_FILES as $key => $value)
				if(strlen($value["name"]) > 0)
				{
					$t = substr($key, 1); # Cut the Typ from the Var named tTyp
					if((substr($key, 0, 1) != "t") || ($t == 0)) # Out of scope
						continue;

					if(Check_Grant($obj, $t))
					{
						BlackList(substr(strrchr($value["name"], '.'), 1));
						if(!file_exists(UPLOAD_DIR))
							mkdir(UPLOAD_DIR);

            			# Get the File's ID
            			$result = Exec_sql("SELECT req.id FROM $z req, $z def, $z base
            			                        WHERE req.up=$obj AND base.id=def.t AND def.id=req.t AND base.t=".$GLOBALS["BT"]["FILE"]
            			                    , "Get File attr ID");
            			if($row = mysqli_fetch_array($result))  # The filename is not empty
						{
						    $req_id = $row["id"];
							Update_Val($req_id, $value["name"]); # update the filename in the DB
						}
						else
							$req_id = Insert($obj, 1, $t, $value["name"], "Insert new Filename");

						$subdir = GetSubdir($req_id);
						if(!file_exists($subdir))
							@mkdir($subdir);
						if(!move_uploaded_file($value['tmp_name']
											, $subdir."/".GetFilename($req_id).".".substr(strrchr($value["name"],'.'),1)))
							die (t9n("[RU]Не удалось заменить файл[EN]File updating failed"));
						$arg .= $subdir."/".GetFilename($req_id).".".substr(strrchr($value["name"],'.'),1);
					}
				}
            if($t == 0)
                die(t9n("[RU]Нет набора атрибутов ($key) или пустое значение ($val) [EN]No attribute set ($key) or empty value ($val)"));
			$a = "nul";
			break;

		case "_m_save":
			# Get the Object's ID value and Type
			if($id === "")
			    my_die(t9n("[RU]Неверный ID[EN]Invalid ID"));
			$result = Exec_sql("SELECT a.val, a.t typ, a.up, a.ord, typs.t FROM $z typs, $z a WHERE typs.id=a.t AND a.id=$id", "Get current Val and Type");
			if($row = mysqli_fetch_array($result))
				$cur_val = $row["val"];
			else
				exit("No such record");
			if($row["up"]==0)
				exit("Cannot update meta-data");
			$typ = $row["typ"];
			$base_typ = $GLOBALS["basics"][$row["t"]];
			$up = $row["up"];
			if($up > 1)
				$arg = "F_U=$up";  # Retain this for Array elements only
			$GLOBALS["REV_BT"][$typ] = $GLOBALS["REV_BT"][$row["t"]];

			$search_str = "";
			foreach($_REQUEST as $key => $value) # Check if we have some search criteria for Ref lists
				if((substr($key, 0, 7) == "SEARCH_") && (strlen($value)))
					if($value != $_REQUEST["PREV_$key"])	# we have this updated
					{
						$search[substr($key, 7)] = $value;
						$search_str .= "&$key=$value"; # Pass the criteria via GET - prepare the address string
					}
#print_r($GLOBALS); die();
			if(isset($_REQUEST["copybtn"])) # Check if we have to make a copy of the Obj
			{
				Check_Grant($id);
				$copy = TRUE;
				if($up > 1)
					$ord = Calc_Order($up, $typ);
				else
					$ord = 1;
				# Copy the object and replace its ID
				$old_id = $id;
				if(strlen($_REQUEST["t$typ"]))	# Get the object Val from the form - this might be updated
					$GLOBALS["REQS"][$typ] = $cur_val = $_REQUEST["t$typ"];	# and update the current Val
				$id = Insert($up, $ord, $typ, $cur_val, "Copy the object");
				Populate_Reqs($old_id, $id);	# Populate requisites' reqs
            	Insert_batch("", "", "", "", "Flush Copy");
#print_r($GLOBALS);die($block."!");
				if(isset($GLOBALS["BOOLEANS"]))  # Clean the previous set of reqs in case we copy the Obj
					unset($GLOBALS["BOOLEANS"]);
			    $arg = "copied1=1&";
			}
			else
			{
			    $arg = "saved1=1&";
				$copy = FALSE;
			}

			$GLOBALS["REQ_TYPS"][$typ] = $id;
			Get_Current_Values($id, $typ);
			$GLOBALS["REQS"][$typ] = $cur_val;
#print_r($GLOBALS); die();

			foreach($_REQUEST as $key => $value){
				$t = substr($key, 1); # Cut the Typ from the Var named tTyp
				if((substr($key, 0, 1) != "t") || ($t == 0) || !is_numeric($t)) # Out of scope or empty
					continue;
				$req_id = isset($GLOBALS["REQ_TYPS"][$t]) ? $GLOBALS["REQ_TYPS"][$t] : 0; # Current Requisite's ID
				if(!in_array($t, array("101", "102", "103", "132", "49")))
				    $value = BuiltIn($value);
				# Format the value
				if(!isset($GLOBALS["REF_typs"][$t]))
				    $v = Format_Val($t, $value);
				else{
				    if(isset($GLOBALS["MULTI"][$t])
							|| (is_array($GLOBALS["ObjectReqs"][$t]["multiselect"]["id"]) && (count($GLOBALS["ObjectReqs"][$t]["multiselect"]["id"])>1)))
				        if(!isset($_REQUEST["NEW_$t"]))
    				        continue;
				    $v = $value;
				}
				if((($t == TOKEN) || ($t == XSRF) || ($t == PASSWORD)) && ($v === PASSWORDSTARS)) // Skip hidden PWDs
			        continue;

				if(isset($_REQUEST["NEW_$t"]) && isset($GLOBALS["REF_typs"][$t]))
					if(strlen($_REQUEST["NEW_$t"])) # Check if we got a new Object to create for reference
					{
						$value = $_REQUEST["NEW_$t"];
						if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE val='".addslashes($_REQUEST["NEW_$t"])
																."' AND t=".$GLOBALS["REF_typs"][$t], "Check if the Ref exists")))
							$v = $row["id"];
						elseif(Grant_1level($GLOBALS["REF_typs"][$t]) == "WRITE")
							$v = Insert(1, 1, $GLOBALS["REF_typs"][$t], addslashes($_REQUEST["NEW_$t"]), "Insert the new Ref Obj");
						else
							die(t9n("[RU]У вас нет прав на создание объектов этого типа (".$GLOBALS["REF_typs"][$t].").[EN]You don't have permission to create (".$GLOBALS["REF_typs"][$t].") type of object."));
					}
				# Check if the user tries to set a read-only Object in a report
    		    if($base_typ == "REPORT_COLUMN")
					if(($t == REP_COL_SET) || ($t == $typ))
					    if((strlen($_REQUEST["t".REP_COL_SET]) != 0))
                            if(($_REQUEST["t$typ"] !== $GLOBALS["REQS"][$typ]) || ($_REQUEST["t".REP_COL_SET] != $GLOBALS["REQS"][REP_COL_SET]))
        					    CheckRepColGranted($_REQUEST["t$typ"], "WRITE");
                
				if($v != $GLOBALS["REQS"][$t])# Check if the value was modified
				{
#die("$t : $v != ".$GLOBALS["REQS"][$t]);
					if($t == $typ)
					{
						Check_Grant($id); # Check the grant to change the Object
    					# Check if the user tries to set a forbidden Object - barred in their role
            		    if($base_typ == "REPORT_COLUMN")
            		        CheckRepColGranted((int)$v);
    					# Check if the user tries to rename the admin
            	        if(($typ == USER) && ($GLOBALS["REQS"][$t] === $z))
							my_die(t9n("[RU]Нельзя изменить имя администратора, лучше создайте нового[EN]Please create another user instead of renaming the admin"));
					}
					elseif($t == REP_COL_SET)
					    CheckRepColGranted($cur_val, "WRITE");
					elseif(!Check_Grant($id, $t, "WRITE", FALSE)){ # Check the grant to change the Req
					    trace("REQS:");
						foreach($GLOBALS["REQS"] as $k => $v)
						    trace(" $k => $v");
					    trace("ObjectReqs:");
						foreach($GLOBALS["ObjectReqs"] as $k => $v)
						    trace(" $k => ".print_r($v, true));
						my_die(t9n("[RU]У вас нет доступа к реквизиту объекта: $id, $t (".$GLOBALS["GRANTS"][$row["t"]]
                    			.")[EN]The object is not granted: $id, $t (".$GLOBALS["GRANTS"][$row["t"]].")"));
					}
					if(strlen($value) != 0)  # Non empty Value
					{
						if(isset($GLOBALS["REF_typs"][$t]))
						{
							if($row = mysqli_fetch_array(Exec_sql("SELECT val FROM $z WHERE id=".(int)$v." AND t=".$GLOBALS["REF_typs"][$t], "Check Ref's Type")))
							{
								Check_Val_granted($GLOBALS["REF_typs"][$t], $row["val"], (int)$v);
								if(($req_id == 0) || (isset($GLOBALS["MULTI"][$t])))
								{
									Insert($id, 1, $v, "$t", "Insert new Ref"); # A new Value
                        			checkDuplicatedReqs($id, $t);
								}
								else
									Exec_sql("UPDATE $z SET t=$v WHERE id=$req_id", "Update Reference");
								if(isset($search[$t]))
									unset($search[$t]); # Clean the search criteria to leave the form
							}
							else
								my_die(t9n("[RU]Неверный тип объекта с ID=$v или объект не найден[EN]Invalid object type with ID=$v or the object was not found"));
						}
						else{
        					if($t == PASSWORD) // Encrypt the password in case it's updated
        						$v = sha1(Salt(isset($_REQUEST["t".USER]) ? trim($_REQUEST["t".USER]) : $cur_val, $v)); // Salt it with the new or current user name
            				trace("BuiltIn $v of ".$t." = ".BuiltIn($v));
            				trace(" base = ".$GLOBALS["REV_BT"][$t]);
        					#$v = Format_Val($t, BuiltIn($v));
							if((int)$req_id === 0){
								Insert($id, 1, $t, $v, "Insert new non-empty rec");
                    			checkDuplicatedReqs($id, $t);
							}
							else
								Update_Val($req_id, $v);
						}
					}
					elseif(!isset($GLOBALS["MULTI"][$t])) # The Value was cleared, and it's not a multi Ref
					{
					    if($req_id == 0)
							$GLOBALS["warning"] .= t9n("[RU]Пустой тип реквизита![EN]Empty attribute type")."<br>";
						elseif($t != $typ) # We cannot clear the Object's Val (just skip the action)
							Exec_sql("DELETE FROM $z WHERE id=$req_id OR up=$req_id", "Delete Empty Obj");
						else
							$GLOBALS["warning"] .= t9n("[RU]Нельзя оставить пустым имя объекта![EN]Object name cannot be blank!")."<br>";
					}
				}
				if($GLOBALS["REV_BT"][$t] == "BOOLEAN")  # Forget the processed boolean Req
					unset($GLOBALS["BOOLEANS"][$t]);
			}
#print_r($GLOBALS); die();
# Drop all empty Logical Object's Reqs (those not confirmed by the edit form)
			if(isset($GLOBALS["BOOLEANS"]))
				foreach($GLOBALS["BOOLEANS"] as $key => $value)
					if(isset($_REQUEST["b$key"]))	# The Req wasn't present in the edit form
						if(Check_Grant($id, $key, "WRITE", FALSE))	# Don't stop in case the user has no Grant - we won't change anything
							Exec_sql("DELETE FROM $z WHERE id=".$GLOBALS["REQ_TYPS"][$key], "Clear empty boolean Reqs");
#print_r($GLOBALS); die();
			foreach($_FILES as $key => $value)
				if(strlen($value["name"]) > 0)
				{
					$t = substr($key, 1); # Cut the Typ from the Var named tTyp
					if((substr($key, 0, 1) != "t") || ($t == 0)) # Out of scope
						continue;
					$tmp = explode("/", $value["name"]);
					$value["name"] = array_pop($tmp);

					if(Check_Grant($id, $t))
					{
						BlackList(substr(strrchr($value["name"], '.'), 1));
						if(!file_exists(UPLOAD_DIR))
							mkdir(UPLOAD_DIR);

						$req_id = $GLOBALS["REQ_TYPS"][$t]; # Current Requisite's ID
						if((int)$req_id > 0)
							Update_Val($req_id, $value["name"]); # update the filename in the DB
						else  # The filename was empty
							$req_id = Insert($id, 1, $t, $value["name"], "Insert new Filename");

						$subdir = GetSubdir($req_id);
						if(!file_exists($subdir))
							@mkdir($subdir);
						if(!move_uploaded_file($value['tmp_name']
											, $subdir."/".GetFilename($req_id).".".substr(strrchr($value["name"],'.'),1)))
							die (t9n("[RU]Не удалось загрузить файл[EN]File uploading failed")." ".$value['tmp_name']."->".$subdir."/".GetFilename($req_id).".".substr(strrchr($value["name"],'.'),1));
					}
				}
#print_r($GLOBALS); die();
			if(isset($search))  # We're searching the dropdown list
			{
				$a = "edit_obj";
				$arg = str_replace("%", "%25", $search_str);
				break;
			}
# Check, if there are NOT NULL reqs not filled in, and stay in Edit mode, if any
			if(isset($GLOBALS["NOT_NULL"]))
				foreach($GLOBALS["NOT_NULL"] as $key => $value)
					if(Check_Grant($typ, $key, "WRITE", FALSE)) # The object is NOT_NULL and we have the grant to change it
					{
						if((isset($_REQUEST["t$key"]) ? strlen($_REQUEST["t$key"]) : FALSE)
						  || (isset($_REQUEST["NEW_$key"]) ? strlen($_REQUEST["NEW_$key"]) : FALSE)
						  || (isset($GLOBALS["ARR_typs"][$key]) && ($GLOBALS["REQS"][$key] != 0))
						  || isset($_REQUEST["copybtn"])
						  || (isset($GLOBALS["MULTI"][$key]) && (count($GLOBALS["ObjectReqs"][$key]["multiselect"]["id"])>0)))
							continue;
						if(!isset($GLOBALS["warning"]))
						    $GLOBALS["warning"] = "";
						$GLOBALS["warning"] .= t9n("[RU]Данные сохранены. Необходимо заполнить реквизиты, выделенные красным[EN]The data are saved. The attributes marked red are mandatory")."!<br>";
					    $next_act = ""; # Prevent redirection in case something is missing
						
						break;
					}
			if(isset($GLOBALS["warning"])) # In case we got warnings - stay in Edit mode
			{
    			$a = "edit_obj";
				$arg .= (isset($_REQUEST["tab"]) ? "tab=".(int)$_REQUEST["tab"] : "")."&warning=".$GLOBALS["warning"];
            	$obj = $id;
			}
			else
			{
				$arg .= "F_U=$up&F_I=$id";
    			$a = "object"; # Show this Object after we finish editing it
            	$obj = $id;
            	$id = $typ;
			}
			break;

		case "_m_move":
			if($id==0)
				die(t9n("[RU]Неверный id: $id[EN]Wrong id: $id"));
			Check_Grant($id);
			# Get the Object
			$result = Exec_sql("SELECT a.up, a.t, up.t ut, a.ord, target.t tt, COALESCE(MAX(reqs.ord)+1,1) new_ord
									FROM $z a, $z up, $z target, $z reqs
									WHERE up.id=a.up AND a.id=$id AND target.id=$up AND reqs.up=$up"
								, "Get Obj to move");
			if($row = mysqli_fetch_array($result))
			{
			    $arg = "moved&";
				if($up != 1)
				{
					Check_Grant($up, $row["t"]);
					$arg .= "&F_U=$up";  # Retain this for Array elements only
					$ord = $row["new_ord"];
				}
				elseif(Grant_1level($row["t"]) != "WRITE")
					die(t9n("[RU]У вас нет прав на создание объектов этого типа.[EN]You don't have permission to create this type of object."));
				else
					$ord = 1;
				if($row["up"]==0)
					exit("Cannot update meta-data");
				if($row["ut"]!=$row["tt"])
					exit("Types mismatch ".$row["t"]."!=".$row["tt"]);
				if($row["up"]!=$up)
				{
#					echo("The same parent $up");
					Exec_sql("UPDATE $z SET ord=$ord, up=$up WHERE id=$id", "Move Obj");
					Exec_sql("UPDATE $z SET ord=ord-1 WHERE up=".$row["up"]." AND t=".$row["t"]." AND ord>".$row["ord"], "Move peers up");
				}
			}
			else
				exit("No such record");
            $a = "object";
			break;

		case "_m_del":
			if($id == 0)
				my_die(t9n("[RU]Неверный id: $id[EN]Wrong id: $id"));
			Check_Grant($id);
			if($id == $GLOBALS["GLOBAL_VARS"]["user_id"])
			    my_die(t9n("[RU]Нельзя удалить себя как пользователя[EN]The user is not able to delete himself, sorry"));
			$refs = exec_sql("SELECT count(r.id), obj.up, obj.ord, obj.t, obj.val, par.up pup, type.up tup FROM $z obj"
			                    ." LEFT JOIN $z type ON type.id=obj.t"
			                    ." LEFT JOIN $z r ON r.t=obj.id JOIN $z par ON par.id=obj.up WHERE obj.id=$id"
					, "Get Refs to the Object");
			if($row = mysqli_fetch_array($refs)){
	
				if($row["pup"] == 0)
					my_die(t9n("[RU]Нельзя удалить метаданные (реквизит $id типа [EN]You can't delete metadata (the $id type".$row["up"].")!"));
				if($row[0] > 0)
					my_die(t9n("[RU]Нельзя удалить объект, на который существует ссылки (всего: [EN]You can't delete an object that has links to it (total:").$row[0].")!");
				if($row["up"] > 1){ # We'll drop the Array or Reference element, so we need to adjust the order of its peers
					if($row["tup"] === "0"){ # Array element
    					$arg = "F_U=".$row["up"];
    					Exec_sql("UPDATE $z SET ord=ord-1 WHERE up=".$row["up"]." AND t=".$row["t"]." AND ord>".$row["ord"], "Move peers");
					}
    				elseif(is_numeric($row["val"])) # Reference that might be multiselect
    					Exec_sql("UPDATE $z SET ord=ord-1 WHERE up=".$row["up"]." AND val='".$row["val"]."' AND ord>".$row["ord"], "Move peers");
				}
				//Delete($id);
				BatchDelete($id);
				$obj=$id;
				$id = $row["t"];
                $a = "object";
			}
			else
				die(t9n("[RU]Объект не найден[EN]Object not found"));
			BatchDelete(""); // Flush batch
            $a = "object";
			break;

		case "_m_new":
			if($up == 0)
				my_die(t9n("[RU]Недопустимые данные: up=0. Установите значение=1 для независимых объектов.[EN]Data is invalid: up=0. Set up=1 for independent objects."));
			if($id == 0)
				my_die(t9n("[RU]Недопустимый id=0.[EN]Invalid id=0."));
		    # Check if the Type exists and has reqs
			$data_set = Exec_sql("SELECT obj.t, obj.ord, req.id, req.t reqt, req.val, def.t base"
			                        ." FROM $z obj LEFT JOIN $z req ON req.up=$id LEFT JOIN $z def ON def.id=req.t"
			                        ." WHERE obj.id=$id AND obj.up=0"
								, "Check Obj type&reqs");
			if($row = mysqli_fetch_array($data_set)){
				$val = isset($_REQUEST["t$id"]) ? $_REQUEST["t$id"] : "";
			    if(($GLOBALS["basics"][$row["t"]] == "REPORT_COLUMN") && ((int)$val != 0))
			        CheckRepColGranted($val);
				$base_typ = $row["t"];
				$has_reqs = strlen($row["id"]);
				$unique = $row["ord"];	# Ord=1 means the Obj must be unique
			    do{
			        $req_list[$row["id"]] = $row["reqt"];
			        if(!isset($_REQUEST["t".$row["id"]]) && ($GLOBALS["basics"][$row["base"]] !== "BUTTON")){
                		if(strpos($row["val"], MULTI_MASK) !== FALSE)
                			$GLOBALS["MULTI"][$row["id"]] = $row["reqt"];
    				    $attrs = removeMasks($row["val"]);
    					if($attrs !== ""){
    					    if(isset($_REQUEST["NEW_".$row["id"]]) && isset($GLOBALS["REF_typs"][$t])) 
    					        continue; // "NEW_" was submitted for the Ref, skip the default value
    						$v = BuiltIn($attrs); # Calc predefined value
    						if($v == $attrs){ # BuiltIn gave nothing - try calculatables
    							$id_bak = $id;
    							Get_block_data($attrs);
    							$id = $id_bak;   # Restore ID and Block info
    							if(isset($blocks[$attrs][strtolower($attrs)])){
    								if(count($blocks[$attrs][strtolower($attrs)]) === 1)
    									$v = array_shift($blocks[$attrs][strtolower($attrs)]);
    								else
    								    continue;
    							}
        						elseif(isset($blocks[$attrs])){
    								$tmp = array_shift($blocks[$attrs]);
        						    if(count($tmp) === 1)
        								$v = array_shift($tmp);
    								else
    								    continue;
        						}
    						}
    						$GLOBALS["DEFVAL"][$row["id"]] = true;
    						$GLOBALS["GRANTS"][$row["id"]] = "WRITE";
        			        $_REQUEST["t".$row["id"]] = $v;
    					}
			        }
			    } while($row = mysqli_fetch_array($data_set));

				# Calc the order
				$ord = 1;
				if($up != 1){
					if($row = mysqli_fetch_array(Exec_sql("SELECT up FROM $z WHERE id=$up", "Check the object "))){
						if($row[0] == 0)
    					    my_die(t9n("[RU]Родительский объект $up - метаданные.[EN] The parent object $up is metadata."));
					}
					else
					    my_die(t9n("[RU]Родительский объект $up не найден.[EN]The parent object $up not found."));
					Check_Grant($up, $id);
					$ord = Calc_Order($up, $id);
				}
				elseif(Grant_1level($id) != "WRITE")
					die(t9n("[RU]У вас нет прав на создание объектов этого типа.[EN]You don't have permission to create this type of object"));
				# Calc the default value
				if($val == ""){
					if($GLOBALS["REV_BT"][$base_typ] == "NUMBER"){
					    if($unique){ # For the unique numeric Obj find the maximum Val (if there are no non-empty reqs) and use its ID
    						$data_set = Exec_sql("SELECT MAX(CAST(val AS UNSIGNED)) val FROM $z WHERE t=$id AND up=$up", "Get max Val of numeric Obj");
    						$max_val = 0;
    						if($row = mysqli_fetch_array($data_set))
    							if($row[0] > 0)
    								$max_val = $row[0];
    
    						$data_set = Exec_sql("SELECT id FROM $z obj WHERE t=$id AND val=$max_val AND up=$up
    												AND NOT EXISTS(SELECT * FROM $z reqs WHERE up=obj.id)", "Get 'empty' numeric Obj");
    						if($row = mysqli_fetch_array($data_set)){
    							$id = $row[0];	# Get the first empty object and go Editing it
    							$a= "edit_obj";
    							break;
    						}
    						else
    							$val = $max_val + 1;
					    }
					    else
					        $val = 1;
					}
					elseif($GLOBALS["REV_BT"][$base_typ] == "DATE") # Default Date is Today
						$val = Format_Val($base_typ, date("d", time() + $GLOBALS["tzone"]));
					elseif($GLOBALS["REV_BT"][$base_typ] == "DATETIME") # Default Datetime is Now
						$val = time();
					elseif($GLOBALS["REV_BT"][$base_typ] == "SIGNED") # Default number is 1
						$val = 1;
					else	# Set the Order instead of the empty Value
						$val = $ord;
				}
				else
					$val = Format_Val($base_typ, BuiltIn($val));
				# The Type must be unique - let's check this
				if($unique && !isset($max_val))
					if($row = mysqli_fetch_array(Exec_sql("SELECT id, ord FROM $z WHERE t=$id AND val='".addslashes($val)."' AND up=$up LIMIT 1"
														, "Check Obj's uniquity")))
						if(strlen($row[0])){
						    $msg = t9n("[RU]Запись уже существует[EN]The record already exists");
                			$arg = "exists1=1";
                			if(isApi())
                			    die("{\"id\":$row[0],\"obj\":$id,\"ord\":".$row[1].",\"next_act\":\"edit_obj\",\"args\":\"$arg\",\"val\":\"".htmlentities($val)."\",\"warning\":\"$msg\"}");
                			if($has_reqs){ # If the Typ has any Reqs - call the Object editor
    						    $obj = $id;
                				$id = $row[0];
                			    $a = "edit_obj";
    						}
                			else{
                				$a = "object";
                				if($up != 1)
                					$arg .= "&F_U=$up";  # Retain this for Array elements only
                			}
                			break;
						}
			}
			else
				die(t9n("[RU]Проверка типа неуспешна[EN]Type check failed"));
			$i = Insert($up, $ord, $id, $val, "Add Object");
#print_r($GLOBALS); die();
# Now insert all the reqs, that might be submitted
			foreach($_REQUEST as $key => $value)
			if($key != "t$id"){ // Skip the object itself
			    if(isset($newRefCreated[$key])) // "NEW_" was submitted and processed
			        continue;
				if(substr($key, 0, 4) === "NEW_"){
				    $t = substr($key, 4);
    				if(!isset($GLOBALS["REQ_TYPS"][$t]))
    					Get_Current_Values($i, $id);
					if(strlen($value) && isset($GLOBALS["REF_typs"][$t])) # Check if we got a new Object to create for reference
					{
						if($row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE val='".addslashes($value)
																."' AND t=".$GLOBALS["REF_typs"][$t], "Check if the Ref exists (_m_new)")))
							$value = $row["id"];
						elseif(Grant_1level($GLOBALS["REF_typs"][$t]) == "WRITE")
							$value = Insert(1, 1, $GLOBALS["REF_typs"][$t], addslashes($value), "Insert the new Ref Obj (_m_new)");
						else
							die(t9n("[RU]У вас нет прав на создание объектов этого типа (".$GLOBALS["REF_typs"][$t].").[EN]You don't have permission to create (".$GLOBALS["REF_typs"][$t].") type of object."));
						$key = "t$t";
						$newRefCreated[$key] = TRUE;
					}
					else
					    continue;
				}
				else
    				$t = substr($key, 1); # Cut the Typ from the Var named tTyp
    			if(!isset($req_list[$t])) # Check if the type exists
    			    continue;
				if((substr($key, 0, 1) != "t") || ($t == 0)) # Out of scope
				{
					if(substr($key, 0, 7) == "SEARCH_")	# Pass the Req list filter in case we got one
						$arg .= "$key=$value&";
					continue;
				}
				if(!isset($GLOBALS["REQ_TYPS"][$t]))
					Get_Current_Values($i, $id);
#				$req_id = $GLOBALS["REQ_TYPS"][$t]; # Current Requisite's ID
#print_r($GLOBALS); die(" $id $i $t ");
				# Format the value
/*
				if(($GLOBALS["REV_BT"][$t] == "NUMBER") && ($value != 0))
					$v = (int)$value;
				elseif(($GLOBALS["REV_BT"][$t] == "SIGNED") && ($value != 0))
					$v = (double)$value;
				else
*/
				$v = Format_Val($t, BuiltIn($value));

				Check_Grant($i, $t); # Check the grant to change the Req
				if(strlen($value) != 0){  # Non empty Value
					if(isset($GLOBALS["REF_typs"][$t])){
						$refs = explode(",", $v);
						foreach($refs as $v){
    						$v = (int)$v;
    						if($v == 0)
            					continue;
    						if($row = mysqli_fetch_array(Exec_sql("SELECT val FROM $z WHERE id=$v AND t=".$GLOBALS["REF_typs"][$t], "Check Ref's req Type"))){
    						    if(!isset($GLOBALS["DEFVAL"][$t]))
        							Check_Val_granted($GLOBALS["REF_typs"][$t], $row["val"], $v);
    							Insert($i, 1, $v, "$t", "Insert new Ref req"); # A new Value
    							if(!isset($GLOBALS["MULTI"][$t]))
    							    break;
    						}
    						else
            					continue;
						}
#							my_die(t9n("[RU]Неверный тип объекта ($t) с ID=$v или объект не найден [EN]Invalid object type with ID=$v or the object was not found"));
					}
					elseif($t == PASSWORD)
						Insert($i, 1, $t, sha1(Salt($val, $v)), "Insert a first time password");
					else
						Insert($i, 1, $t, $v, "Insert new non-empty req");
				}
			}
		    #mywrite($GLOBALS["TRACE"]);
			# Upload the files
			foreach($_FILES as $key => $value)
				if(strlen($value["name"]) > 0)
				{
					$t = substr($key, 1); # Cut the Typ from the Var named tTyp
					if((substr($key, 0, 1) != "t") || ($t == 0)) # Out of scope
						continue;
					if(Check_Grant($i, $t))
					{
						BlackList(substr(strrchr($value["name"], '.'), 1));
						$req_id = Insert($i, 1, $t, $value["name"], "Insert new Filename");
						if(!file_exists(UPLOAD_DIR))
							mkdir(UPLOAD_DIR);
						$subdir = GetSubdir($req_id);
						if(!file_exists($subdir))
							@mkdir($subdir);
						if(!move_uploaded_file($value['tmp_name']
											, $subdir."/".GetFilename($req_id).".".substr(strrchr($value["name"],'.'),1)))
							die (t9n("[RU]Не удалось загрузить файл[EN]File uploading failed"));
					}
				}
			if($has_reqs) # If the Typ has any Reqs - call the Object editor
			{
			    $a = "edit_obj";
				$id = $i;
    			$arg = "new1=1&$arg";
			}
			else
			{
				$a = "object";
				if($up != 1)
					$arg = "F_U=$up";  # Retain this for Array elements only
			}
			$obj=$i;
			if(isApi())
			    die("{\"id\":$i,\"obj\":$obj,\"ord\":$ord,\"next_act\":\"$a\",\"args\":\"$arg\",\"val\":\"".htmlentities(Format_Val_View($base_typ, $val))."\"}");
			break;
# Type editor commands
		case "_d_req":
		case "_attributes":
			if(($id == 0) || ($t == 0))
				my_die(t9n("[RU]Неверный реквизит ($t) или ID ($id)[EN] Invalid requisite($t) or ID ($id)"));
			if($row = mysqli_fetch_array(Exec_sql("SELECT obj.up objup, new.t, obj.val, new.id, new.up, ex.id existing"
		                                        ." FROM $z obj LEFT JOIN $z new ON new.id=$t"
		                                        ."  LEFT JOIN ($z ex CROSS JOIN $z ext CROSS JOIN $z exb) ON ex.up=obj.id AND ex.t=$t AND ext.id=ex.t AND exb.id=ext.t AND exb.t=exb.id"
		                                        ." WHERE obj.id=$id"
							                , "Check the new req"))){
				if(($row["id"] == 0) || ($row["up"] != 0))
					my_die(t9n("[RU]Неверный реквизит $t [EN]Invalid requisite($t)"));
				if($row["objup"] != 0)
					my_die(t9n("[RU]Некорректный тип $id - ".$row["val"]." (это не метаданные)[EN]"));
				if($row["t"] == $t)
					my_die(t9n("[RU]Некорректный тип $t - это базовый тип[EN]Invalid type $t is the base type"));
				if($row["existing"]){
				    $obj = $id;
				    $id = $row["existing"];
					$GLOBALS["warning"] = (t9n("[RU]Реквизит $t уже существует![EN]Requisite $val already exists!"));
				    break;
				}
			}
			else
				my_die(t9n("[RU]Не найден тип $id [EN]$id type not found"));
			$obj = $id;
			if(!isset($GLOBALS["basics"][$row["t"]]) && isset($_REQUEST["multiselect"]))
			    $attr = MULTI_MASK; # It is a reference and it must be multi-selectable
			else
			    $attr = "";
			$id = Insert($id, Get_Ord($id), $t, $attr, "Add Req");
			break;
			
		case "_d_save":
		case "_patchterm":
			if($val == "")
				my_die(t9n("[RU]Неверный тип ($val) [EN]Invalid type ($val)"));
			if($row = mysqli_fetch_array(Exec_sql("SELECT obj.t, obj.val, obj.ord FROM $z obj
									LEFT JOIN $z dup ON dup.id!=$id AND dup.id!=dup.t AND dup.val='".addslashes($val)
								."' AND dup.t=$t WHERE obj.id=$id AND dup.id IS NULL", "Get Object and check duplicates"))){
	
				if(($row["t"] != 0) && ($t == 0))
					my_die(t9n("[RU]Неверный базовый тип ($t) [EN]Invalid base type ($t)"));
				if(($row["t"] != $t) || ($row["val"] != $val) || ($row["ord"] != $unique))
					Exec_sql("UPDATE $z SET t=$t, val='".addslashes($val)."', ord='$unique' WHERE id=$id", "Change typ");
			}
			else
				my_die(t9n("[RU]Тип $val с базовым типом ".$GLOBALS["REV_BT"][$t]." уже существует. [EN]The $val type with the base type ". $GLOBALS ["REV_BT"][$t]. " already exists."));
			$obj=$id;
			break;

		case "_d_alias":
		case "_setalias":
			if(strpos($val, ":") !== false)
				my_die(t9n("[RU]Недопустимый символ &laquo;:&raquo; в псевдониме $val [EN] Invalid character &laquo;:&raquo; in the alias $val"));
			if($row = mysqli_fetch_array(Exec_sql("SELECT $z.val, par.up, $z.up myup FROM $z, $z par WHERE $z.id=$id AND par.id=$z.t", "Get Ref alias")))
			{
				if($row["up"] != 0)
					my_die(t9n("[RU]Ошибка подчиненности объекта ссылки [EN]Error in subordination of the link object"));
				$up = $row["myup"];
				$alias = explode(ALIAS_DEF, $row["val"]);
				if(isset($alias[1])) # $alias[1] is OldAlias::bla-bla...
				{
					if(mb_strlen($alias[1]) > mb_strpos($alias[1],":")+1)
						$alias[1] = mb_substr($alias[1],mb_strpos($alias[1],":")+1);
					else
						$alias[1] = "";
					if($val != "")
						$alias[1] = ALIAS_DEF.$val.":".$alias[1];
					Exec_sql("UPDATE $z SET val='".implode($alias)."' WHERE id=$id", "Update alias");
				}
				elseif($val != "")
					Exec_sql("UPDATE $z SET val=CONCAT(val,'".ALIAS_DEF.addslashes($val).":') WHERE id=$id", "Set alias");
			}
			else
				my_die(t9n("[RU]Тип $id не найден [EN]Type $id not found"));
			$id = $obj = $up;
			break;

		case "_d_new":
		case "_terms":
			if($val == "")
				my_die(t9n("[RU]Пустой тип[EN]Empty type"));
			if(!isset($_REQUEST["t"]))
				my_die(t9n("[RU]Не задан базовый тип[EN]Base type is not set"));
			if(!isset($GLOBALS["basics"][$_REQUEST["t"]]) && ($_REQUEST["t"] !== "0"))
				my_die(t9n("[RU]Неверный базовый тип[EN]Base type is invalid").": ".htmlentities($_REQUEST["t"]));
			if(!$row = mysqli_fetch_array(Exec_sql("SELECT id FROM $z WHERE val='".addslashes($val)."' AND t=$t AND id!=t", "Check Typ presence")))
				$obj = Insert(0, $unique, $t, $val, "Create Typ");
			else{
			    $obj = $row["id"];
				$GLOBALS["warning"] = (t9n("[RU]Тип $val уже существует![EN]The Type $val already exists!"));
			}
#print($GLOBALS["TRACE"]); die($id);
			break;

		case "_d_ref":
		case "_references":
			if($id == 0)
				my_die(t9n("[RU]Неверная ссылка ($id) [EN]Invalid link ($id)"));
			if($row = mysqli_fetch_array(Exec_sql("SELECT obj.up, obj.t, ref.id FROM $z obj LEFT JOIN $z ref ON ref.up=0 AND ref.t=$id AND ref.val='' WHERE obj.id=$id"
			                                    , "Check the new ref")))
			{
				if(($row["up"] != 0) || ($row["t"] == $id))
					my_die(t9n("[RU]Неверный тип $id - [EN]Invalid $id type -".$row["val"]));
				if($row["id"] > 0){
				    $obj = $row["id"];
				    break;
				}
			}
			else
				my_die(t9n("[RU]Не найден тип $id [EN]$Id type not found"));
			$obj = Insert(0, 0, $id, "", "Create Ref");
			break;

		case "_d_null":
		case "_setnull":
			$result = Exec_sql("SELECT obj.id FROM $z req LEFT JOIN $z obj ON obj.id=req.up WHERE req.id=$id and obj.up=0"
							, "Check the req and obj");
			if($row = mysqli_fetch_array($result))
    			Exec_sql("UPDATE $z SET val=CASE WHEN val LIKE '%".NOT_NULL_MASK."%' THEN REPLACE(val, '".NOT_NULL_MASK
    									."', '') ELSE CONCAT(val, '".NOT_NULL_MASK."') END WHERE id=$id", "Switch NULL-able");
    		else
    		    my_die(t9n("[RU]Неверный реквизит $id [EN]Invalid requisite $id "));
    		$obj = $row["id"];
			break;

		case "_d_multi":
		case "_setmulti":
			$result = Exec_sql("SELECT obj.id FROM $z req LEFT JOIN $z obj ON obj.id=req.up WHERE req.id=$id and obj.up=0"
							, "Check the req and obj");
			if($row = mysqli_fetch_array($result))
    			Exec_sql("UPDATE $z SET val=CASE WHEN val LIKE '%".MULTI_MASK."%' THEN REPLACE(val, '".MULTI_MASK
    									."', '') ELSE CONCAT(val, '".MULTI_MASK."') END WHERE id=$id", "Switch Multi-select flag");
    		else
    		    my_die(t9n("[RU]Неверный реквизит $id [EN]Invalid requisite $id "));
    		$obj = $row["id"];
			break;

		case "_d_attrs":
		case "_modifiers":
			if(isset($_REQUEST["alias"])) # Append alias, if it's set
				if(strlen($_REQUEST["alias"]))
					$val = ALIAS_DEF.$_REQUEST["alias"].":$val";
			if(isset($_REQUEST["set_null"])) # Append NOT_NULL_MASK
				$val = NOT_NULL_MASK.$val;
			if(isset($_REQUEST["multi"])) # Append MULTI_MASK
				$val = MULTI_MASK.$val;
			Update_Val($id, $val);
			$obj = $up;
			break;

		case "_d_up":
		case "_moveup":
			$result = Exec_sql("SELECT obj.up, obj.ord, max(peers.ord) new_ord
								FROM $z obj LEFT JOIN $z peers ON peers.up=obj.up AND peers.ord<obj.ord WHERE obj.id=$id"
							, "Get new Order");
			if($row = mysqli_fetch_array($result))
			{
				$id = $row["up"];
    			if($row["new_ord"] > 0)
    				Exec_sql("UPDATE $z SET ord=(CASE WHEN ord=".$row["ord"]." THEN ".$row["new_ord"]
    											." WHEN ord=".$row["new_ord"]." THEN ".$row["ord"]
    						." END) WHERE up=$id AND (ord=".$row["ord"]." OR ord=".$row["new_ord"].")", "Change order");
    			$obj=$id;
			}
			else
			    my_die(t9n("[RU]Не найден id=$id [EN] Id=$id not found"));
			break;

		case "_d_ord":
		case "_setorder":
	        if(!is_numeric($_REQUEST["order"]) || ((int)$_REQUEST["order"] < 1))
        		die("Invalid order");
        	$newOrd = (int)$_REQUEST["order"];
			$result = Exec_sql("SELECT req.ord, req.up FROM $z req, $z par WHERE req.id=$id AND par.id=req.up AND par.up=0", "Check the req");
			if($row = mysqli_fetch_array($result)){
			    if("$newOrd" !== $row["ord"]){
			        $rid = $id;
    				$id = $row["up"];
    				$ord = $row["ord"];
    				Exec_sql("UPDATE $z SET ord=(CASE WHEN id=$rid THEN LEAST($newOrd, (SELECT max(ord) FROM $z WHERE up=$id)) ELSE ord+SIGN($ord-$newOrd) END)"
    						." WHERE up=$id AND ord BETWEEN LEAST($ord, $newOrd) AND GREATEST($ord, $newOrd)", "Set exact req order");
			    }
    			$obj=$id;
			}
			else
			    my_die(t9n("[RU]Не найден id=$id [EN] Id=$id not found"));
			break;

		case "_d_del":
		case "_deleteterm":
			$data_set = Exec_sql("SELECT COUNT(id) FROM $z WHERE t=$id", "Check, if the Typ is being used");
			if($row = mysqli_fetch_array($data_set))
				if($row[0] > 0)
					die(t9n("[RU]Нельзя удалить тип при наличии его экземпляров (всего: "
					    ."[EN]Cannot delete the Type in case there are objects of this type (total objects: ").$row[0].")!");
			$sql = "SELECT reqs.id FROM $z, $z reqs WHERE $z.t=".REP_COLS." AND $z.val=reqs.id AND (reqs.up=$id OR reqs.id=$id) LIMIT 1";
			if($row = mysqli_fetch_array(Exec_sql($sql, "Check, if the Reqs are being used in Reports")))
				my_die (t9n("[RU]Тип или его реквизиты используются в <a href=\"/$z/object/".REPORT."/?F_".REP_COLS."=".$row["id"]."\">отчетах</a>"
				        ."[EN]The type or its requisites are used in <a href=\"/$z/object/".REPORT."/?F_".REP_COLS."=".$row["id"]."\">reports</a>"));
			$sql = "SELECT objs.t, objs.val FROM $z, $z r, $z objs WHERE r.t=".ROLE." AND r.up=1 AND objs.up=r.id AND objs.val=$z.id AND ($z.up=$id OR $z.id=$id) LIMIT 1";
			if($row = mysqli_fetch_array(Exec_sql($sql, "Check, if the Reqs are being used in Roles")))
				die(t9n("[RU]Тип или его реквизиты используются в <a href=\"/$z/object/".ROLE."/?F_".$row["t"]."=".$row["val"]."\">ролях</a>!)
				    .[EN]The type or its requisites are used in <a href=\"/$z/object/".ROLE."/?F_".$row["t"]."=".$row["val"]."\">roles</a>!"));
#print_r($GLOBALS); die($sql);
			Delete($id);
			break;

		case "_d_del_req":
		case "_deletereq":
			$data_set = Exec_sql("SELECT def.up, def.t typ, def.ord, r.t, r.val FROM $z def, $z r WHERE def.id=$id AND r.id=def.t", "Get Req's typ");
			if($row = mysqli_fetch_array($data_set))
			{
				$myord = $row["ord"]; # Save Up and Ord to move other reqs up
				$myup = $row["up"];
				if(isset($GLOBALS["basics"][$row["t"]]))	# It's not a reference
					$sql = "SELECT count(1) FROM $z obj, $z req WHERE obj.t=$myup AND (req.t=".$row["typ"]." OR req.t=$id) AND req.up=obj.id";
				else
					$sql = "SELECT count(1) FROM $z obj, $z req WHERE obj.t=$myup AND req.up=obj.id AND req.val='$id'";
				if($row = mysqli_fetch_array(Exec_sql($sql, "Check, if the Req is being used"))){
					if($row[0] > 0){
					    if(isset($_POST["forced"])){
					        $sql = str_replace("count(1)", "req.id", $sql);
					        $data_set = Exec_sql($sql, "Get col data to clean");
            				while($row = mysqli_fetch_array($data_set))
            					Delete($row[0]);
            				$sql = "SELECT reqs.id FROM $z, $z reqs WHERE $z.t=".ROLE." AND $z.up=1 AND reqs.up=$z.id AND reqs.val='$id'";
					        $data_set = Exec_sql($sql, "Get grants to clean");
            				while($row = mysqli_fetch_array($data_set))
            					Delete($row[0]);
					    }
					    else
    						my_die(t9n("[RU]Вы хотите удалить реквизит у типа при наличии этого реквизита у экземпляров (всего: "
    						        ."[EN]You are going to delete a requisite if there are records of this type (total records: ").$row[0].")!");
					}
					$sql = "SELECT ".REP_COLS." t FROM $z WHERE t=".REP_COLS." AND val='$id' "
							."UNION SELECT reqs.t FROM $z, $z reqs WHERE $z.t=".ROLE." AND $z.up=1 AND reqs.up=$z.id AND reqs.val='$id' LIMIT 1";
					if($row = mysqli_fetch_array(Exec_sql($sql, "Check, if the Req is being used in Reports or Roles")))
						my_die(t9n("[RU]Этот реквизит используется в <a href=\"/$z/object/".REPORT."/?F_".REP_COLS
    							."=$id\">отчетах</a> или <a href=\"/$z/object/".ROLE."/?F_116=$id\">ролях</a>!"
							."[EN]The requisite is used in <a href=\"/$z/object/".REPORT."/?F_".REP_COLS
	       						."=$id\">reports</a> or <a href=\"/$z/object/".ROLE."/?F_116=$id\">roles</a>!"));
					Delete($id);
					Exec_sql("UPDATE $z SET ord=ord-1 WHERE up=$myup AND ord>$myord", "Move up other Reqs");
					$id = $obj = $myup;
				}
			}
			break;

		case "_new_db":
		    if($z !== "my")
		        my_die(t9n("[RU]Создайте базу в Личном кабинете![EN]Create DB in your private space!"));
		    $db = strtolower($_GET["db"]);
		    if(checkDbNameReserved($db))
        		my_die(t9n("[RU]Имя базы $db занято или зарезервировано[EN]This DB name is reserved")."[errDbNameReserved]");
        	if(!checkDbName(USER_DB_MASK, $db))
        		my_die(t9n("[RU]Недопустимое имя базы $db (от 3 до 15 латинских букв и цифр, начиная с буквы)"
        		        ."[EN]Please correct the username: $db (3 to 15 latin letters or digits, starting with a letter)")."[errDbName]");
			$result = Exec_sql("SELECT count(1) dbs, plan.t plan FROM $z db LEFT JOIN $z plan ON plan.up=db.up AND plan.val=1143"
			                    ." LEFT JOIN $z name ON name.up=db.up AND name.t=33" // User name
			                    ." LEFT JOIN $z mail ON mail.up=db.up AND mail.t=".EMAIL // User email
			                    ." WHERE db.up=".$GLOBALS["GLOBAL_VARS"]["user_id"]." AND db.t=".DATABASE, "Count the existing DBs");
			$row = mysqli_fetch_array($result);
// REMOVED LIMIT: 			    if($row["dbs"] >= 3 && (int)$row["plan"] < 1147)
// REMOVED LIMIT:     			    my_die(t9n("[RU]В бесплатном тарифе доступно не более 3 баз[EN]Maximum 3 DBs available on a free plan"));
            if(!isDbVacant($db))
			    my_die(t9n("[RU]Имя базы $db занято[EN]The DB name for $db is occupied"));
			$template=strtolower($_REQUEST["template"]);
			newDb($db, $template, $row["name"], $row["email"], "");
            $id = Insert($GLOBALS["GLOBAL_VARS"]["user_id"], 1, DATABASE, $db, "Register extra DB");
            Insert($id, 1, 275, date("Ymd"), "Insert new DB date");
            Insert($id, 1, 283, $template, "Insert new DB template");
            Insert($id, 1, 276, $_POST["descr"], "Insert new DB notes");
			api_dump(json_encode(array("status"=>"Ok","id"=>$id)), "_new_db.json");
			break;
			
		case "obj_meta":
        	$sql = "SELECT obj.id, obj.up, obj.t, obj.val, req.id req_t, req.t ref_id, refs.id ref, req.val attrs, req.ord
        				, CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END base_typ
        				, CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END req_val
        				, CASE WHEN arrs.id IS NULL THEN NULL ELSE typs.id END arr_id
        			FROM $z obj
        			    LEFT JOIN $z req ON req.up=$id
        			    LEFT JOIN $z typs ON typs.id=req.t
        			    LEFT JOIN $z refs ON refs.id=typs.t AND refs.t!=refs.id
        				LEFT JOIN $z arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
        			WHERE obj.id=$id ORDER BY req.ord";
        	$data_set = Exec_sql($sql, "Get the Obj meta");
        	$meta = "{";
        	while($row = mysqli_fetch_array($data_set)){
                if($meta === "{")
        	        $meta .= "\"id\":\"".$row["id"]."\",\"up\":\"".$row["up"]."\",\"type\":\"".$row["t"]."\",\"val\":\"".$row["val"]."\"";
                if(!isset($reqs))
                    $reqs = ",\"reqs\":{";
                else
                    $reqs .= ",";
                $reqs .= "\"".$row["ord"]."\":{\"id\":\"".$row["req_t"]."\""
                            .",\"val\":\"".$row["req_val"]."\""
                            .",\"type\":\"".$row["base_typ"]."\""
                            .($row["arr_id"]?",\"arr_id\":\"".$row["arr_id"]."\"":"")
                            .($row["ref"]?",\"ref\":\"".$row["ref"]."\",\"ref_id\":\"".$row["ref_id"]."\"":"")
                            .($row["attrs"]?",\"attrs\":\"".$row["attrs"]."\"":"")
                        ."}";
        	}
            if(isset($reqs))
                $reqs .= "}";
	        $meta .= $reqs . "}";
			api_dump($meta, "$id.json");
		    break;
		    
		case "metadata":
		    $isOne = $id > 0;
        	$sql = "SELECT obj.id, obj.up, obj.t, obj.ord uniq, obj.val, req.id req_t, req.t ref_id, refs.id ref, req.val attrs, req.ord
        				, CASE WHEN refs.id IS NULL THEN typs.t ELSE refs.t END base_typ
        				, CASE WHEN refs.id IS NULL THEN typs.val ELSE refs.val END req_val
        				, CASE WHEN arrs.id IS NULL THEN NULL ELSE typs.id END arr_id
        			FROM $z obj
                        LEFT JOIN $z req ON req.up=".($isOne ? $id : "obj.id")."
                        LEFT JOIN $z typs ON typs.id=req.t
                        LEFT JOIN $z refs ON refs.id=typs.t AND refs.t!=refs.id
                        LEFT JOIN $z arrs ON refs.id IS NULL AND arrs.up=typs.id AND arrs.ord=1
        			WHERE ".($isOne ? "obj.id=$id" : "obj.up=0 AND obj.id!=obj.t AND obj.val!='' AND obj.t!=0")
        		." ORDER BY obj.id, req.ord";
        	$data_set = Exec_sql($sql, "Get the Term meta");
            $data = $data_set->fetch_all(MYSQLI_ASSOC);
            $reqs = Array();
        	foreach($data as $row) // Collect all the reqs to skip them later
        	    if(!is_null($row["ref_id"]))
        	        $reqs[$row["ref_id"]] = $row["id"];
        	$meta = Array();
            $metaReqs = Array();
        	foreach($data as $row){
    		    if(($row["id"] === $row["t"]) || ($row["up"] !== "0"))
    		        die("Invalid Term id $id");
                if(!$row["ord"] && isset($reqs[$row["id"]])) // Skip reqs with no reqs
                    continue;
    	        $meta[$row["id"]] = "\"id\":\"".$row["id"]."\",\"up\":\"".$row["up"]."\",\"type\":\"".$row["t"]."\",\"val\":\"".$row["val"]."\",\"unique\":\"".$row["uniq"]."\"";
                if($row["ord"])
                    $metaReqs[$row["id"]][] = "{\"num\":".$row["ord"].",\"id\":\"".$row["req_t"]."\""
                                .",\"val\":\"".addcslashes($row["req_val"], "\\\'")."\""
                                .",\"orig\":\"".($row["ref"]?$row["ref"]:$row["ref_id"])."\""
                                .",\"type\":\"".$row["base_typ"]."\""
                                .($row["arr_id"]?",\"arr_id\":\"".$row["arr_id"]."\"":"")
                                .($row["ref"]?",\"ref\":\"".$row["ref"]."\",\"ref_id\":\"".$row["ref_id"]."\"":"")
                                .($row["attrs"]?",\"attrs\":\"".$row["attrs"]."\"":"")."}";
        	}
	        foreach($meta as $k => $m)
	            if($metaReqs[$k])
    	            $meta[$k] = "{".$m.",\"reqs\":[".implode(",", $metaReqs[$k])."]}";
                else
    	            $meta[$k] = "{".$m.",\"reqs\":[]}";
            if($isOne)
    			api_dump(implode(",", $meta), "metadata_$id.json");
    		else
    			api_dump("[".implode(",", $meta)."]", "metadata_all.json");
		    break;
		    
    	case "exit":
            Exec_sql("DELETE FROM $z WHERE up=".$GLOBALS["GLOBAL_VARS"]["user_id"]." AND t=".TOKEN, "Exit - drop the token");
    		if(strlen($next_act))
    			die("<script>document.location.href='/$z/$next_act'</script>");
            login($z);
    		break;

		case "xsrf":
			api_dump(json_encode(array("_xsrf"=>$GLOBALS["GLOBAL_VARS"]["xsrf"],"token"=>$GLOBALS["GLOBAL_VARS"]["token"],"user"=>$GLOBALS["GLOBAL_VARS"]["user"]
			    ,"role"=>$GLOBALS["GLOBAL_VARS"]["role"],"id"=>$GLOBALS["GLOBAL_VARS"]["user_id"],"msg"=>""), JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE), "login.json");
		    break;
		    
		case "terms":
			$sql = "SELECT a.id, a.val, a.t, reqs.t reqs_t FROM $z a LEFT JOIN $z reqs ON reqs.up=a.id
						WHERE a.up=0 AND a.id!=a.t AND a.val!='' AND a.t!=0 ORDER BY a.val";
			$data_set = Exec_sql($sql, "Get all independent Terms");
			while($row = mysqli_fetch_array($data_set))  # All but buttons and calculatables
				if(($GLOBALS["REV_BT"][$row["t"]] != "CALCULATABLE") && ($GLOBALS["REV_BT"][$row["t"]] != "BUTTON"))
				{
				    $base[$row["id"]] = $row["t"];
					if(!isset($req[$row["id"]]))  # Not used as Req yet
						$typ[$row["id"]] = $row["val"];
					if($row["reqs_t"])	# Check if our Reqs are on list of independents and remove them
					{
						unset($typ[$row["reqs_t"]]);
						$req[$row["reqs_t"]] = "";	# Remember the Req ID
					}
				}
	        $json = "";
			if(count($typ))
				foreach($typ as $id => $val)
					if(Grant_1level($id))
        		        $json .= "{\"id\":$id,\"type\":".$base[$id].",\"name\":\"".htmlspecialchars($val)."\"},";
	        $json = $json === "" ? "[]" : "[".mb_substr($json, 0, -1)."]";
	        api_dump($json, "terms.json");
		    break;

		case "_ref_reqs":
		    if((int)$id === 0)
		        die("{\"error\":\"Invalid id\"}");
#		    trace("grants $id:".Grant_1level($id));
#		    if(Grant_1level($id) !== "WRITE")
#		        my_die("{\"error\":\"No grants to id $id\"}");
			$data_set = Exec_sql("SELECT dic.t dic, r.val attr, def_reqs.t, req_orig.t base, base.id!=base.t is_ref, req.id req_id
			                        FROM $z r JOIN $z dic ON dic.id=r.t JOIN $z par ON par.id=r.up AND par.up=0
			                            LEFT JOIN $z def_reqs ON def_reqs.up=r.t LEFT JOIN $z req_orig ON req_orig.id=def_reqs.t LEFT JOIN $z base ON base.id=req_orig.t
    									LEFT JOIN $z req ON req.up=dic.t AND req.t=def_reqs.t
			                        WHERE r.id=$id ORDER BY def_reqs.ord"
			                    , "Get refs reqs");
			# Fetch extra fields for the value of the Ref list
			$ref_reqs = Array();
			$joins = Array();
		    $list = Array();
			$reqs = $reqs_granted = $sub_reqs = $search_req = $restrict = $wild_search = "";
			while($row = mysqli_fetch_array($data_set)){
			    if(!isset($dic)){
    			    $dic = $row["dic"];
    			    if(strlen($row["attr"]) > 0){
    			        $attrs = removeMasks($row["attr"]);
    					if(strlen($attrs) > 0){ # Some value - this might be a report
    						$id_bak = $id;
    						$block_bak = $block;
    						if(isset($_REQUEST["q"])) // Apply the filter on ID or Value
    						    if(substr($_REQUEST["q"], 0, 1) === "@")
        						    $GLOBALS["REQREF"]["1"] = $_REQUEST["q"];
        						elseif(strpos($_REQUEST["q"], "%") === false)
        						    $GLOBALS["REQREF"]["2"] = "%".$_REQUEST["q"]."%";
        						else
        						    $GLOBALS["REQREF"]["2"] = $_REQUEST["q"];
    						Get_block_data($attrs);
    						$id = $id_bak;   # Restore ID and Block info
    						$block = $block_bak;
                            if(isset($blocks[$attrs])){
                                $ids = array_shift($blocks[$attrs]);
                                $vals = array_shift($blocks[$attrs]);
                                $alts = array_shift($blocks[$attrs]);
    							foreach($ids as $k => $i)
                			        if(!is_numeric($i))
                                		die("Invalid id for the dropdown list ($i)");
                            	    elseif(!isset($list[$i]))
                            			$list[$i] = strlen($vals[$k])>0 ? $vals[$k] : (isset($alts)&&strlen($alts[$k])>0 ? $alts[$k] : $v);
                    			die(json_encode($list));
                            }
    					}
    			    }
			    }
        	    trace(" row: ".implode(",",$row));
				if(isset($row["t"])){
    				$ref_reqs[] = $req = $row["req_id"];
					if($row["is_ref"])	# Join requisites' tables
						$joins[$req] = " LEFT JOIN ($z r$req CROSS JOIN $z a$req) ON r$req.up=vals.id AND a$req.id=r$req.t AND a$req.t=".$row["base"];
					else
						$joins[$req] = " LEFT JOIN $z a$req ON a$req.up=vals.id AND a$req.t=".$row["req_id"];
					$reqs .= ", $req"."val";	# Fetch Requisites' values
					$sub_reqs .= ", a$req.val $req"."val";
					$wild_search .= ",'/',COALESCE(a$req.val,'')";
        			if(isset($_REQUEST["r"]) && ($restrict === "")){
        			    if(strpos($_REQUEST["r"], ",") !== FALSE){
        			        $tmp = explode(",", $_REQUEST["r"]);
        			        foreach($tmp as $v)
                			    if(is_numeric($v))
        			                $restrict .= ",".$v;
        			        $restrict = " AND a$req.id IN(".substr($restrict, 1).")";
        			    }
        			    elseif(is_numeric($_REQUEST["r"]))
        				    $restrict = " AND a$req.id=".$_REQUEST["r"];
        				trace("restrict = $restrict");
        			}
				}
			}
		    //trace("wild_search $wild_search");
			if(isset($_REQUEST["q"]) && strlen($_REQUEST["q"])){	# Apply Req filter, if any
    		    $wild_search = $wild_search === "" ? "vals.val" : "concat(vals.val $wild_search)";
				$GLOBALS["REV_BT"][1] = "SHORT";
				$GLOBALS["where"] = "";
				if(strpos($_REQUEST["q"],"%") === false)
    				$search = preg_replace("( ?\/ ?)","%/%",$_REQUEST["q"]);
				else
				    $search = $_REQUEST["q"];
				Construct_WHERE(1, array("F" => "%".addslashes($search)."%"), 1, FALSE);
				$search_req = str_replace("a1.val",$wild_search, $GLOBALS["where"]);
			}
		    trace("search_req $search_req");
			# Fetch grants
			if(isset($GLOBALS["GRANTS"]["mask"])){
    			# Fetch grants to the Referenced Object itself
    			if(isset($GLOBALS["GRANTS"]["mask"][$dic])){
    				unset($granted);
    				foreach($GLOBALS["GRANTS"]["mask"][$dic] as $mask => $level){ # Apply all masks
    					$GLOBALS["where"] = "";
    					$GLOBALS["REV_BT"][$dic] = "SHORT";
    					Construct_WHERE($dic, array("F" => $mask), 1, FALSE);
    					if(isset($granted))
    						$granted .= " OR ".substr($GLOBALS["where"], 4);
    					else
    						$granted = substr($GLOBALS["where"], 4);
    				}
    				$reqs_granted .= str_replace("a$dic.val", "vals.val", str_replace("a$dic.id", "vals.id", " AND ($granted) "));
    			}
    			$data_set = Exec_sql("SELECT req.id, req.t, CASE WHEN orig.id!=orig.t THEN orig.id END ref FROM $z req, $z def, $z orig WHERE req.up=$dic AND def.id=req.t AND orig.id=def.t"
   			                , "Get refs obj reqs");
    			unset($granted);
    			while($row = mysqli_fetch_array($data_set))
    			    foreach($GLOBALS["GRANTS"]["mask"] as $key => $masks)
    			        if($key == $row["id"])
    			            foreach($masks as $mask => $level){
    			                trace("  req mask $key - $mask");
    			                if($row["ref"]){
        			                $GLOBALS["REV_BT"][$key] = "REFERENCE";
        			                $GLOBALS["REF_typs"][$key] = $row["ref"];
    			                }
    			                else
        			                $GLOBALS["REV_BT"][$key] = "SHORT";
        						$GLOBALS["where"] = $GLOBALS["join"] = "";
        						Construct_WHERE($key, array("F" => $mask), $id, $key);
        						$joins[$req] = $GLOBALS["join"];
        						if(isset($granted))
        							$granted .= " OR ".substr($GLOBALS["where"], 4);
        						else
        							$granted = substr($GLOBALS["where"], 4);
    			                trace("   join_granted[$key] ".$GLOBALS["join"]);
    			                trace("   reqs_granted ".$GLOBALS["where"]);
            			    }
				if(isset($granted))
					$reqs_granted = "AND ($granted)";
        	}
			$sql = "SELECT vals.id, vals.val ref_val $reqs 
						FROM (SELECT vals.id, vals.val $sub_reqs FROM $z vals ".implode(" ", $joins).", $z pars
						WHERE pars.id=vals.up AND pars.up!=0 AND vals.t=$dic $reqs_granted $search_req $restrict LIMIT ".DDLIST_ITEMS.") vals
					    ORDER BY vals.val";
			$data_set = Exec_sql($sql, "Get ref reqs");
			while($row = mysqli_fetch_array($data_set)){
			    if(!isset($list[$row["id"]]))
    			    $list[$row["id"]] = $row["ref_val"];
				foreach($ref_reqs as $v)  # Append more identifying info to the dropdown list values
    			    $list[$row["id"]] .= isset($row[$v."val"]) ? " / ".$row[$v."val"] : " / --";
			    trace($row["id"]." = ".$list[$row["id"]]);
			}
			die(json_encode($list, JSON_UNESCAPED_UNICODE));
			break;
			
		case "_connect":
			if($id == 0)
				my_die(t9n("[RU]Неверный id ($id) [EN]Invalid id ($id)"));
			$sql = "SELECT val FROM $z WHERE up=$id AND t=".CONNECT;
			if($row = mysqli_fetch_array(Exec_sql($sql, "Get the connector")))
			{
			    trace("Got connector: ".$row["val"]);
				foreach($_GET as $k => $v)
					$url .= "&$k=$v";
				$url = $row["val"] . (strpos($row["val"],"?") ? "&" : "?") . substr($url, 1);
			    trace("url: $url");
				$ch = curl_init();
				curl_setopt($ch, CURLOPT_HEADER, 0);
				curl_setopt($ch, CURLOPT_HTTPHEADER, array("User-Agent: Integram"));
				curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
				curl_setopt($ch, CURLOPT_URL, $url);
				$val = curl_exec($ch);
				if(curl_errno($ch)){
					$val = curl_errno($ch).": $val";
					$file_failed = true;
				}
				curl_close($ch);
				die("$val");
			}
		    break;

		default:
    		$user = $GLOBALS["GLOBAL_VARS"]["user"];
    		$f_u = isset($_REQUEST["F_U"]) ? (int)$_REQUEST["F_U"] : "1"; # Filter for associated (linked) objects
    		if(isset($_GET["warning"]))
    			$GLOBALS["warning"] = $_REQUEST["warning"];
    
    		if($a == "report")
    		{
    			unset($blocks); # We might get some stuff there already
    			$text = Get_file("report.html"); # Avoid UI header and styles
    			if(isset($_REQUEST["obj"]))
    				if($_REQUEST["obj"] != 0)
    					$obj = (int)$_REQUEST["obj"];  # Set the exact object for calculatables
    		}
    		elseif($a == "dir_admin") # Admin should be able to fix the files anyway,
    		{
    			Make_tree(Get_file("dir_admin.html"), ""); # thus, avoid UI header and styles
    			die(Parse_block(""));
    		}
    		else
    			$text = Get_file("main.html");
#    		wlog("$user@".$_SERVER["REMOTE_ADDR"], "log");

        	if(isset($_REQUEST["TIME"]))
        		set_time_limit(3600);
        	Make_tree($text, "&main");
        	$html = Parse_block("&main");

        	$time = substr(microtime(TRUE) - $time_start, 0, 6);
        	$stime = round($GLOBALS["sql_time"], 4);
        	$scount = $GLOBALS["sqls"];
        	$tzone = $GLOBALS["tzone"];
            mysqli_query($connection, "UPDATE my SET ord=ord+".round($time*1000, 0)." WHERE t=".DATABASE." AND val='$z'");
    		wlog("$user@".$_SERVER["REMOTE_ADDR"]."[$scount/$time/$stime]", "log");
			if(isApi())
			    if(isset($_REQUEST["JSON_DATA"]))
    				die("[".implode(",", $GLOBALS["GLOBAL_VARS"]["newapi"])."]");
    			else
    				die(json_encode($GLOBALS["GLOBAL_VARS"]["api"], JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE));
        	if(($z == $GLOBALS["GLOBAL_VARS"]["user"]) || ($GLOBALS["GLOBAL_VARS"]["user"] == "admin"))
        		echo str_replace("<!--Elapsed-->"
        		                , "<font  size=\"-1\"><a href=\"/$z/dir_admin\">[$user]</a> $scount / $stime / $time ($tzone)</font>", $html);
        	else
        		echo str_replace("<!--Elapsed-->", "<font size=\"-1\">[$user] $scount / $stime / $time ($tzone)</font>", $html);
        	myexit();
	}
}
elseif(isApi())
    my_die(t9n("[RU]Ошибка проверки токена $z[EN]Not logged into $z"));
else
	login($z);
#print_r($GLOBALS); die();

if(isset($_REQUEST["message"]))
	die("<h3>".$_REQUEST["message"]."</h3>");
if($next_act == "nul")
	die('{"id":"'.$id.'", "obj":"'.$obj.'", "a":"'.$a.'", "args":"'.$arg.'"}');
elseif($next_act == "")
    $next_act = $a;
else
    $next_act = str_replace("[id]", isset($obj)?$obj:"", $next_act);
if(substr($a, 0, 3) == "_d_")
    $arg .= "ext";
if(isApi())
	api_dump(json_encode(array("id"=>$id, "obj"=>$obj, "next_act"=>"$next_act", "args"=>$arg
	                            , "warnings"=>(isset($GLOBALS["warning"])?$GLOBALS["warning"]:"")), JSON_HEX_QUOT | JSON_UNESCAPED_UNICODE));
header("Location: /$z/$next_act/$id".(strlen($arg) ? "/?$arg" : "").(isset($obj)?"#$obj":""));
?>