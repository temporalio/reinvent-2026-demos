FROM public.ecr.aws/lambda/python:3.13
COPY requirements-lambda.txt .
RUN pip install --no-cache-dir -r requirements-lambda.txt
COPY *.py ./
ENV TEMPORAL_ENV=cloud
CMD ["lambda_function.lambda_handler"]
