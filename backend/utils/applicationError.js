class ApplicationError extends Error{
    constructor(message,statusCode,code){
        super(message);

        this.name = "ApplicationError";
        this.statusCode = statusCode;
        this.code = code;
    }
}


export default ApplicationError;